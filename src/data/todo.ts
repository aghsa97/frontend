import type { HomeAssistant, ServiceCallResponse } from "../types";
import { computeDomain } from "../common/entity/compute_domain";
import { computeStateName } from "../common/entity/compute_state_name";
import { isUnavailableState } from "./entity";
import { stringCompare } from "../common/string/compare";

export interface TodoList {
  entity_id: string;
  name: string;
}

export const enum TodoItemStatus {
  NeedsAction = "needs_action",
  Completed = "completed",
}

export enum TodoSortMode {
  NONE = "none",
  ALPHA_ASC = "alpha_asc",
  ALPHA_DESC = "alpha_desc",
  DUEDATE_ASC = "duedate_asc",
  DUEDATE_DESC = "duedate_desc",
}

export interface TodoItem {
  uid: string;
  summary: string;
  status: TodoItemStatus | null;
  description?: string | null;
  due?: string | null;
  completed?: string | null;
  // Shopping list specific fields
  category?: string | null;
  quantity?: number | null;
  unit?: string | null;
}

export const enum TodoListEntityFeature {
  CREATE_TODO_ITEM = 1,
  DELETE_TODO_ITEM = 2,
  UPDATE_TODO_ITEM = 4,
  MOVE_TODO_ITEM = 8,
  SET_DUE_DATE_ON_ITEM = 16,
  SET_DUE_DATETIME_ON_ITEM = 32,
  SET_DESCRIPTION_ON_ITEM = 64,
}

export const getTodoLists = (hass: HomeAssistant): TodoList[] =>
  Object.keys(hass.states)
    .filter(
      (entityId) =>
        computeDomain(entityId) === "todo" &&
        !isUnavailableState(hass.states[entityId].state)
    )
    .map((entityId) => ({
      ...hass.states[entityId],
      entity_id: entityId,
      name: computeStateName(hass.states[entityId]),
    }))
    .sort((a, b) => stringCompare(a.name, b.name, hass.locale.language));

export interface TodoItems {
  items: TodoItem[];
}

export const fetchItems = async (
  hass: HomeAssistant,
  entity_id: string
): Promise<TodoItem[]> => {
  const result = await hass.callWS<TodoItems>({
    type: "todo/item/list",
    entity_id,
  });
  return result.items;
};

export const subscribeItems = (
  hass: HomeAssistant,
  entity_id: string,
  callback: (update: TodoItems) => void
) =>
  hass.connection.subscribeMessage<any>(callback, {
    type: "todo/item/subscribe",
    entity_id,
  });

// Shopping list specific API - returns items with quantity, unit, category
export interface ShoppingListItem {
  id: string;
  name: string;
  complete: boolean;
  quantity?: number;
  unit?: string;
  category?: string;
}

export const fetchShoppingListItems = async (
  hass: HomeAssistant
): Promise<ShoppingListItem[]> =>
  hass.callWS<ShoppingListItem[]>({
    type: "shopping_list/items",
  });

// Shopping list category - can be an object with name or just a string
export interface ShoppingListCategory {
  name: string;
}

// Fetch shopping list categories - API may return objects or strings
export const fetchShoppingListCategories = async (
  hass: HomeAssistant
): Promise<string[]> => {
  const result = await hass.callWS<(ShoppingListCategory | string)[]>({
    type: "shopping_list/categories/list",
  });
  // Handle both object format {name: "..."} and string format
  return result.map((cat) => (typeof cat === "string" ? cat : cat.name));
};

// Add a new category to the shopping list
export const addShoppingListCategory = async (
  hass: HomeAssistant,
  name: string
): Promise<string[]> => {
  const result = await hass.callWS<{
    categories: (ShoppingListCategory | string)[];
  }>({
    type: "shopping_list/categories/add",
    name,
  });
  // Handle both object format {name: "..."} and string format
  return result.categories.map((cat) =>
    typeof cat === "string" ? cat : cat.name
  );
};

// Remove a category from the shopping list
export const removeShoppingListCategory = async (
  hass: HomeAssistant,
  category: string
): Promise<void> => {
  await hass.callWS({
    type: "shopping_list/categories/remove",
    category,
  });
};

// Convert ShoppingListItem to TodoItem format for rendering compatibility
export const convertShoppingListItemToTodoItem = (
  item: ShoppingListItem
): TodoItem => ({
  uid: item.id,
  summary: item.name,
  status: item.complete ? TodoItemStatus.Completed : TodoItemStatus.NeedsAction,
  quantity: item.quantity,
  unit: item.unit,
  category: item.category,
});

export const updateItem = (
  hass: HomeAssistant,
  entity_id: string,
  item: TodoItem
): Promise<ServiceCallResponse> =>
  hass.callService(
    "todo",
    "update_item",
    {
      item: item.uid,
      rename: item.summary,
      status: item.status,
      description: item.description,
      due_datetime: item.due?.includes("T") ? item.due : undefined,
      due_date:
        item.due === undefined || item.due?.includes("T")
          ? undefined
          : item.due,
    },
    { entity_id }
  );

// Shopping list specific update - uses shopping_list/items/update WebSocket API
export const updateShoppingListItem = (
  hass: HomeAssistant,
  item: TodoItem
): Promise<unknown> => {
  // Build message with only defined fields - backend is strict about types
  const msg: Record<string, unknown> = {
    type: "shopping_list/items/update",
    item_id: item.uid,
  };
  if (item.summary !== undefined) {
    msg.name = item.summary;
  }
  if (item.status !== undefined) {
    msg.complete = item.status === TodoItemStatus.Completed;
  }
  // Quantity must be a float - explicitly convert and only include if valid
  if (item.quantity !== undefined && item.quantity !== null) {
    const qty = parseFloat(String(item.quantity));
    if (!Number.isNaN(qty)) {
      msg.quantity = qty;
    }
  }
  if (item.unit !== undefined && item.unit !== "") {
    msg.unit = item.unit;
  }
  if (item.category !== undefined && item.category !== "") {
    msg.category = item.category;
  }
  return hass.callWS(msg as { type: string; [key: string]: unknown });
};

export const createItem = (
  hass: HomeAssistant,
  entity_id: string,
  item: Omit<TodoItem, "uid" | "status">
): Promise<ServiceCallResponse> =>
  hass.callService(
    "todo",
    "add_item",
    {
      item: item.summary,
      description: item.description || undefined,
      due_datetime: item.due?.includes("T") ? item.due : undefined,
      due_date:
        item.due === undefined || item.due?.includes("T")
          ? undefined
          : item.due,
    },
    { entity_id }
  );

// Shopping list specific - uses shopping_list/items/add WebSocket API
export const createShoppingListItem = (
  hass: HomeAssistant,
  _entity_id: string,
  item: { name: string; quantity?: number; unit?: string; category?: string }
): Promise<unknown> => {
  // Build message with only defined fields - backend is strict about types
  const msg: Record<string, unknown> = {
    type: "shopping_list/items/add",
    name: item.name,
  };
  // Quantity must be a float - explicitly convert and only include if valid
  if (item.quantity !== undefined && item.quantity !== null) {
    const qty = parseFloat(String(item.quantity));
    if (!Number.isNaN(qty)) {
      msg.quantity = qty;
    }
  }
  if (item.unit !== undefined && item.unit !== "") {
    msg.unit = item.unit;
  }
  if (item.category !== undefined && item.category !== "") {
    msg.category = item.category;
  }
  return hass.callWS(msg as { type: string; [key: string]: unknown });
};

export const deleteItems = (
  hass: HomeAssistant,
  entity_id: string,
  uids: string[]
): Promise<ServiceCallResponse> =>
  hass.callService(
    "todo",
    "remove_item",
    {
      item: uids,
    },
    { entity_id }
  );

export const moveItem = (
  hass: HomeAssistant,
  entity_id: string,
  uid: string,
  previous_uid: string | undefined
): Promise<void> =>
  hass.callWS({
    type: "todo/item/move",
    entity_id,
    uid,
    previous_uid,
  });
