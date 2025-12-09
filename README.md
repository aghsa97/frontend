# Home Assistant Frontend

This is the repository for the official [Home Assistant](https://home-assistant.io) frontend.

[![Screenshot of the frontend](https://raw.githubusercontent.com/home-assistant/frontend/master/docs/screenshot.png)](https://demo.home-assistant.io/)

- [View demo of Home Assistant](https://demo.home-assistant.io/)
- [More information about Home Assistant](https://home-assistant.io)
- [Frontend development instructions](https://developers.home-assistant.io/docs/frontend/development/)

## Development

- Initial setup: `script/setup`
- Development: [Instructions](https://developers.home-assistant.io/docs/frontend/development/)
- Production build: `script/build_frontend`
- Gallery: `cd gallery && script/develop_gallery`
- Supervisor: [Instructions](https://developers.home-assistant.io/docs/supervisor/developing)

## Frontend development

## Shopping List Extension – Frontend Modifications - Group Assignment 4

This document describes the modifications implemented to extend and improve the Shopping List experience within the Home Assistant frontend. The feature enhancements required coordinated changes across multiple frontend modules, focusing on improved data handling, UI workflows, and Lovelace integration.

### Modified Files Overview

#### 1. src/data/todo.ts

Purpose: Extend the To-Do data model and backend interaction layer.

Changes:

- Added new fields and functions to the TodoItem interface to support extended metadata (e.g., category, notes, quantity, etc.).
- Updated TypeScript types used by the todo API endpoints.
- Modified fetch/update/create/delete helpers to correctly transmit newly added properties.

#### 2. src/panels/lovelace/todo/dialog-todo-item-editor.ts

Purpose: Enhance the item editor dialog with new input fields and UX improvements.

Changes:

- Added UI controls for new todo/shopping item properties (e.g., quantity, category selector).
- Updated save/apply logic to ensure all new properties are persisted through the data layer.
- Enhanced dialog layout for cleaner presentation of extended item data through a popup menu.

#### 3. src/panels/lovelace/todo/ha-panel-todo.ts

Purpose: Update the main To-Do panel to support extended item functionality and improved list behavior.

Changes:

- Adjusted panel rendering logic to display new item attributes.
- Introduced additional list actions (sorting, filtering).

#### 4. src/panels/lovelace/cards/hui-todo-list-card.ts

Purpose: Enhance the Lovelace card to make new Shopping List features accessible from dashboards.

Changes:

- Added two new action buttons to the card toolbar:
  - Group by Category:
    - Introduces UI and logic that reorganizes visible items by their assigned category.
    - Updates the rendering flow to display grouped sections, improving readability especially for shopping lists.

  - Delete All
    - Adds a safety-confirmed action to remove all items from the list at once
    - Integrates directly with the todo data provider to clear the entire list and trigger state refresh.

- Updated card layout to accommodate new action buttons without disrupting existing UI elements.
- Extended event handlers to support new bulk operations and ensure consistency across panel and dialog interactions.

---

### Classic environment

A complete guide can be found at the following [link](https://www.home-assistant.io/developers/frontend/). It describes a short guide for the build of project.

## License

Home Assistant is open-source and Apache 2 licensed. Feel free to browse the repository, learn and reuse parts in your own projects.

We use [BrowserStack](https://www.browserstack.com) to test Home Assistant on a large variety of devices.

[![Home Assistant - A project from the Open Home Foundation](https://www.openhomefoundation.org/badges/home-assistant.png)](https://www.openhomefoundation.org/)
