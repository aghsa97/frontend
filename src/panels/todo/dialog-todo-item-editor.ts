import { TZDate } from "@date-fns/tz";
import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { resolveTimeZone } from "../../common/datetime/resolve-time-zone";
import { fireEvent } from "../../common/dom/fire_event";
import { supportsFeature } from "../../common/entity/supports-feature";
import "../../components/ha-alert";
import "../../components/ha-button";
import "../../components/ha-checkbox";
import "../../components/ha-date-input";
import { createCloseHeading } from "../../components/ha-dialog";
import "../../components/ha-textarea";
import "../../components/ha-textfield";
import "../../components/ha-time-input";
import "../../components/ha-select";
import "@material/mwc-list/mwc-list-item";
import {
  TodoItemStatus,
  TodoListEntityFeature,
  createItem,
  createShoppingListItem,
  deleteItems,
  updateItem,
  updateShoppingListItem,
  fetchShoppingListCategories,
  addShoppingListCategory,
  removeShoppingListCategory,
} from "../../data/todo";
import { showConfirmationDialog } from "../../dialogs/generic/show-dialog-box";
import { haStyleDialog } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import type { TodoItemEditDialogParams } from "./show-dialog-todo-item-editor";
import { supportsMarkdownHelper } from "../../common/translations/markdown_support";
import { formatShortDateTimeWithConditionalYear } from "../../common/datetime/format_date_time";

@customElement("dialog-todo-item-editor")
class DialogTodoItemEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _error?: string;

  @state() private _params?: TodoItemEditDialogParams;

  @state() private _summary = "";

  @state() private _description? = "";

  @state() private _due?: Date;

  @state() private _completedTime?: Date;

  @state() private _checked = false;

  @state() private _hasTime = false;

  @state() private _submitting = false;

  // Shopping list specific fields
  @state() private _category = "";

  @state() private _quantity?: number;

  @state() private _unit = "";

  @state() private _categories: string[] = [];

  // Dates are manipulated and displayed in the browser timezone
  // which may be different from the Home Assistant timezone. When
  // events are persisted, they are relative to the Home Assistant
  // timezone, but floating without a timezone.
  private _timeZone?: string;

  public showDialog(params: TodoItemEditDialogParams): void {
    this._error = undefined;
    this._params = params;
    this._timeZone = resolveTimeZone(
      this.hass.locale.time_zone,
      this.hass.config.time_zone
    );
    if (params.item) {
      const entry = params.item;
      this._checked = entry.status === TodoItemStatus.Completed;
      this._summary = entry.summary;
      this._description = entry.description || "";
      this._completedTime = entry.completed
        ? new Date(entry.completed)
        : undefined;
      this._hasTime = entry.due?.includes("T") || false;
      this._due = entry.due
        ? new Date(this._hasTime ? entry.due : `${entry.due}T00:00:00`)
        : undefined;
      // Shopping list specific fields
      this._category = entry.category || "";
      this._quantity = entry.quantity ?? undefined;
      this._unit = entry.unit || "";
    } else {
      this._hasTime = false;
      this._checked = false;
      this._due = undefined;
      this._category = "";
      this._quantity = undefined;
      this._unit = "";
    }
    // Fetch categories for shopping lists
    this._loadCategories();
  }

  public closeDialog(): void {
    if (!this._params) {
      return;
    }
    this._error = undefined;
    this._params = undefined;
    this._due = undefined;
    this._summary = "";
    this._description = "";
    this._hasTime = false;
    // Reset shopping list fields
    this._category = "";
    this._quantity = undefined;
    this._unit = "";
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    const isCreate = this._params.item === undefined;

    const { dueDate, dueTime } = this._getLocaleStrings(this._due);

    const canUpdate = this._todoListSupportsFeature(
      TodoListEntityFeature.UPDATE_TODO_ITEM
    );

    return html`
      <ha-dialog
        open
        @closed=${this.closeDialog}
        scrimClickAction
        .heading=${createCloseHeading(
          this.hass,
          this.hass.localize(
            `ui.components.todo.item.${isCreate ? "add" : "edit"}`
          )
        )}
      >
        <div class="content">
          ${this._error
            ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
            : ""}

          <div class="flex">
            <ha-checkbox
              .checked=${this._checked}
              @change=${this._checkedCanged}
              .disabled=${isCreate || !canUpdate}
            ></ha-checkbox>
            <ha-textfield
              class="summary"
              name="summary"
              .label=${this.hass.localize("ui.components.todo.item.summary")}
              .value=${this._summary}
              required
              @input=${this._handleSummaryChanged}
              .validationMessage=${this.hass.localize(
                "ui.common.error_required"
              )}
              dialogInitialFocus
              .disabled=${!canUpdate}
            ></ha-textfield>
          </div>
          ${this._completedTime
            ? html`<div class="italic">
                ${this.hass.localize("ui.components.todo.item.completed_time", {
                  datetime: formatShortDateTimeWithConditionalYear(
                    this._completedTime,
                    this.hass.locale,
                    this.hass.config
                  ),
                })}
              </div>`
            : nothing}
          ${this._todoListSupportsFeature(
            TodoListEntityFeature.SET_DESCRIPTION_ON_ITEM
          )
            ? html`<ha-textarea
                class="description"
                name="description"
                .label=${this.hass.localize(
                  "ui.components.todo.item.description"
                )}
                .helper=${supportsMarkdownHelper(this.hass.localize)}
                .value=${this._description}
                @input=${this._handleDescriptionChanged}
                autogrow
                .disabled=${!canUpdate}
              ></ha-textarea>`
            : nothing}
          ${this._todoListSupportsFeature(
            TodoListEntityFeature.SET_DUE_DATE_ON_ITEM
          ) ||
          this._todoListSupportsFeature(
            TodoListEntityFeature.SET_DUE_DATETIME_ON_ITEM
          )
            ? html`<div>
                <span class="label"
                  >${this.hass.localize("ui.components.todo.item.due")}:</span
                >
                <div class="flex">
                  <ha-date-input
                    .value=${dueDate}
                    .locale=${this.hass.locale}
                    .disabled=${!canUpdate}
                    @value-changed=${this._dueDateChanged}
                    can-clear
                  ></ha-date-input>
                  ${this._todoListSupportsFeature(
                    TodoListEntityFeature.SET_DUE_DATETIME_ON_ITEM
                  )
                    ? html`<ha-time-input
                        .value=${dueTime}
                        .locale=${this.hass.locale}
                        .disabled=${!canUpdate}
                        @value-changed=${this._dueTimeChanged}
                      ></ha-time-input>`
                    : nothing}
                </div>
              </div>`
            : nothing}
          ${this._isShoppingList()
            ? html`<div class="shopping-fields">
                <div class="category-row">
                  <ha-select
                    class="category"
                    .label=${this.hass.localize(
                      "ui.components.todo.item.category"
                    ) || "Category"}
                    .value=${this._category}
                    @selected=${this._handleCategoryChanged}
                    @closed=${this._handleSelectClosed}
                    .disabled=${!canUpdate}
                    fixedMenuPosition
                  >
                    <mwc-list-item value=""></mwc-list-item>
                    ${this._categories.map(
                      (category) =>
                        html`<mwc-list-item value=${category}
                          >${category}</mwc-list-item
                        >`
                    )}
                  </ha-select>
                  <ha-icon-button
                    .label=${"Add category"}
                    .path=${"M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"}
                    @click=${this._addNewCategory}
                    .disabled=${!canUpdate}
                  ></ha-icon-button>
                  <ha-icon-button
                    .label=${"Remove category"}
                    .path=${"M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"}
                    @click=${this._removeCategory}
                    .disabled=${!canUpdate || !this._category}
                  ></ha-icon-button>
                </div>
                <ha-textfield
                  class="quantity"
                  name="quantity"
                  type="number"
                  inputmode="decimal"
                  .label=${this.hass.localize(
                    "ui.components.todo.item.quantity"
                  ) || "Quantity"}
                  .value=${this._quantity ?? ""}
                  @input=${this._handleQuantityChanged}
                  .disabled=${!canUpdate}
                ></ha-textfield>
                <ha-select
                  class="unit"
                  .label=${this.hass.localize("ui.components.todo.item.unit") ||
                  "Unit"}
                  .value=${this._unit}
                  @selected=${this._handleUnitChanged}
                  @closed=${this._handleSelectClosed}
                  .disabled=${!canUpdate}
                  fixedMenuPosition
                >
                  <mwc-list-item value=""></mwc-list-item>
                  <mwc-list-item value="pieces">pieces</mwc-list-item>
                  <mwc-list-item value="kg">kg</mwc-list-item>
                  <mwc-list-item value="grams">grams</mwc-list-item>
                  <mwc-list-item value="liters">liters</mwc-list-item>
                </ha-select>
              </div>`
            : nothing}
        </div>
        ${isCreate
          ? html`
              <ha-button
                slot="primaryAction"
                @click=${this._createItem}
                .disabled=${this._submitting}
              >
                ${this.hass.localize("ui.components.todo.item.add")}
              </ha-button>
            `
          : html`
              <ha-button
                slot="primaryAction"
                @click=${this._saveItem}
                .disabled=${!canUpdate || this._submitting}
              >
                ${this.hass.localize("ui.components.todo.item.save")}
              </ha-button>
              ${this._todoListSupportsFeature(
                TodoListEntityFeature.DELETE_TODO_ITEM
              )
                ? html`
                    <ha-button
                      slot="secondaryAction"
                      variant="danger"
                      appearance="plain"
                      @click=${this._deleteItem}
                      .disabled=${this._submitting}
                    >
                      ${this.hass.localize("ui.components.todo.item.delete")}
                    </ha-button>
                  `
                : ""}
            `}
      </ha-dialog>
    `;
  }

  private _todoListSupportsFeature(feature: number): boolean {
    if (!this._params?.entity) {
      return false;
    }
    const entityStateObj = this.hass!.states[this._params?.entity];
    return entityStateObj && supportsFeature(entityStateObj, feature);
  }

  private _getLocaleStrings = memoizeOne((due?: Date) => ({
    dueDate: due ? this._formatDate(due) : undefined,
    dueTime: due ? this._formatTime(due) : undefined,
  }));

  // Formats a date in specified timezone, or defaulting to browser display timezone
  private _formatDate(date: Date, timeZone: string = this._timeZone!): string {
    const tzDate = new TZDate(date, timeZone);
    return tzDate.toISOString().split("T")[0]; // Get YYYY-MM-DD format
  }

  // Formats a time in specified timezone, or defaulting to browser display timezone
  private _formatTime(
    date: Date,
    timeZone: string = this._timeZone!
  ): string | undefined {
    if (!this._hasTime) return undefined;
    const tzDate = new TZDate(date, timeZone);
    return tzDate.toISOString().split("T")[1].split(".")[0]; // Get HH:mm:ss format
  }

  // Parse a date in the browser timezone
  private _parseDate(dateStr: string): Date {
    // If it's a date-only string (no 'T'), parse as midnight in browser time to avoid offset issues
    if (!dateStr.includes("T")) {
      return new Date(dateStr + "T00:00:00");
    }
    const tzDate = new TZDate(dateStr, this._timeZone!);
    return new Date(tzDate.getTime());
  }

  private _checkedCanged(ev) {
    this._checked = ev.target.checked;
  }

  private _handleSummaryChanged(ev) {
    this._summary = ev.target.value;
  }

  private _handleDescriptionChanged(ev) {
    this._description = ev.target.value;
  }

  private _dueDateChanged(ev: CustomEvent) {
    if (!ev.detail.value) {
      this._due = undefined;
      return;
    }
    const time = this._due ? this._formatTime(this._due) : undefined;
    this._due = this._parseDate(`${ev.detail.value}${time ? `T${time}` : ""}`);
  }

  private _dueTimeChanged(ev: CustomEvent) {
    this._hasTime = true;
    this._due = this._parseDate(
      `${this._formatDate(this._due || new Date())}T${ev.detail.value}`
    );
  }

  private _isShoppingList(): boolean {
    if (!this._params?.entity) {
      return false;
    }
    const entityReg = this.hass?.entities[this._params.entity];
    return entityReg?.platform === "shopping_list";
  }

  private async _loadCategories() {
    if (!this._isShoppingList()) {
      this._categories = [];
      return;
    }
    try {
      this._categories = await fetchShoppingListCategories(this.hass!);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to load categories:", err);
      this._categories = [];
    }
  }

  private _handleQuantityChanged(ev: Event) {
    const value = (ev.target as HTMLInputElement).value;
    this._quantity = value ? parseFloat(value) : undefined;
  }

  private _handleCategoryChanged(ev: CustomEvent) {
    const target = ev.target as HTMLSelectElement;
    this._category = target.value || "";
  }

  private async _addNewCategory() {
    const newCategory = prompt("Enter new category name:");
    if (newCategory && newCategory.trim()) {
      try {
        // Add the new category and refresh the list
        this._categories = await addShoppingListCategory(
          this.hass!,
          newCategory.trim()
        );
        // Select the newly created category
        this._category = newCategory.trim();
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error("Failed to add category:", err);
        this._error = err?.message || "Failed to add category";
      }
    }
  }

  private async _removeCategory() {
    if (!this._category) {
      return;
    }

    const confirmed = await showConfirmationDialog(this, {
      title: "Remove Category",
      text: `Are you sure you want to remove the category "${this._category}"?`,
      confirmText: "Remove",
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    try {
      await removeShoppingListCategory(this.hass!, this._category);
      // Refresh categories and clear selection
      this._categories = await fetchShoppingListCategories(this.hass!);
      this._category = "";
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Failed to remove category:", err);
      this._error = err?.message || "Failed to remove category";
    }
  }

  private _handleSelectClosed(ev: Event) {
    ev.stopPropagation();
  }

  private _handleUnitChanged(ev: CustomEvent) {
    const target = ev.target as HTMLSelectElement;
    this._unit = target.value || "";
  }

  private async _createItem() {
    if (!this._summary) {
      this._error = this.hass.localize(
        "ui.components.todo.item.not_all_required_fields"
      );
      return;
    }

    this._submitting = true;
    try {
      // Use shopping list specific WebSocket API for shopping lists
      if (this._isShoppingList()) {
        await createShoppingListItem(this.hass!, this._params!.entity, {
          name: this._summary,
          quantity: this._quantity,
          unit: this._unit || undefined,
          category: this._category || undefined,
        });
      } else {
        await createItem(this.hass!, this._params!.entity, {
          summary: this._summary,
          description: this._description,
          due: this._due
            ? this._hasTime
              ? this._due.toISOString()
              : this._formatDate(this._due)
            : undefined,
        });
      }
    } catch (err: any) {
      this._error = err ? err.message : "Unknown error";
      return;
    } finally {
      this._submitting = false;
    }
    this.closeDialog();
  }

  private async _saveItem() {
    if (!this._summary) {
      this._error = this.hass.localize(
        "ui.components.todo.item.not_all_required_fields"
      );
      return;
    }

    this._submitting = true;
    const entry = this._params!.item!;

    try {
      // Use shopping_list/items/update WebSocket for shopping lists
      if (this._isShoppingList()) {
        // Ensure quantity is a float (backend requires float)
        const quantity =
          this._quantity !== undefined && this._quantity !== null
            ? parseFloat(String(this._quantity))
            : undefined;
        await updateShoppingListItem(this.hass!, {
          ...entry,
          summary: this._summary,
          status: this._checked
            ? TodoItemStatus.Completed
            : TodoItemStatus.NeedsAction,
          quantity:
            quantity !== undefined && !Number.isNaN(quantity)
              ? quantity
              : undefined,
          unit: this._unit || undefined,
          category: this._category || undefined,
        });
      } else {
        await updateItem(this.hass!, this._params!.entity, {
          ...entry,
          summary: this._summary,
          description:
            this._description ||
            (this._todoListSupportsFeature(
              TodoListEntityFeature.SET_DESCRIPTION_ON_ITEM
            )
              ? null
              : undefined),
          due: this._due
            ? this._hasTime
              ? this._due.toISOString()
              : this._formatDate(this._due)
            : this._todoListSupportsFeature(
                  TodoListEntityFeature.SET_DUE_DATETIME_ON_ITEM
                ) ||
                this._todoListSupportsFeature(
                  TodoListEntityFeature.SET_DUE_DATE_ON_ITEM
                )
              ? null
              : undefined,
          status: this._checked
            ? TodoItemStatus.Completed
            : TodoItemStatus.NeedsAction,
        });
      }
    } catch (err: any) {
      this._error = err ? err.message : "Unknown error";
      return;
    } finally {
      this._submitting = false;
    }
    this.closeDialog();
  }

  private async _deleteItem() {
    this._submitting = true;
    const entry = this._params!.item!;
    const confirm = await showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.components.todo.item.confirm_delete.delete"
      ),
      text: this.hass.localize("ui.components.todo.item.confirm_delete.prompt"),
      destructive: true,
      confirmText: this.hass.localize("ui.common.delete"),
      dismissText: this.hass.localize("ui.common.cancel"),
    });
    if (!confirm) {
      // Cancel
      this._submitting = false;
      return;
    }
    try {
      await deleteItems(this.hass!, this._params!.entity, [entry.uid]);
    } catch (err: any) {
      this._error = err ? err.message : "Unknown error";
      return;
    } finally {
      this._submitting = false;
    }
    this.closeDialog();
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        @media all and (min-width: 450px) and (min-height: 500px) {
          ha-dialog {
            --mdc-dialog-min-width: min(600px, 95vw);
            --mdc-dialog-max-width: min(600px, 95vw);
          }
        }
        ha-alert {
          display: block;
          margin-bottom: 16px;
        }
        ha-textfield,
        ha-textarea {
          display: block;
          width: 100%;
        }
        ha-checkbox {
          margin-top: 4px;
        }
        ha-textarea {
          margin-bottom: 16px;
        }
        ha-date-input {
          flex-grow: 1;
        }
        ha-time-input {
          margin-left: 16px;
          margin-inline-start: 16px;
          margin-inline-end: initial;
        }
        .flex {
          display: flex;
          justify-content: space-between;
        }
        .label {
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          color: var(--input-label-ink-color);
        }
        .date-range-details-content {
          display: inline-block;
        }
        ha-svg-icon {
          width: 40px;
          margin-right: 8px;
          margin-inline-end: 16px;
          margin-inline-start: initial;
          direction: var(--direction);
          vertical-align: top;
        }
        .key {
          display: inline-block;
          vertical-align: top;
        }
        .value {
          display: inline-block;
          vertical-align: top;
        }
        .italic {
          font-style: italic;
        }
        .shopping-fields {
          margin-top: 16px;
        }
        .shopping-fields {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 16px;
        }
        .shopping-fields ha-textfield,
        .shopping-fields ha-select {
          width: 100%;
        }
        .category-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .category-row ha-select {
          flex: 1;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-todo-item-editor": DialogTodoItemEditor;
  }
}
