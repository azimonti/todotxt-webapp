# Todo.txt Webapp Help

This document explains how to use the Todo.txt Webapp to manage your tasks.

## Understanding the Todo.txt Format

Each line in your `todo.txt` file represents a single task. The format allows for optional components to add metadata:

**Basic Task:**
```
Develop PWA for todo.txt
```

**With Priority:**
Priority is indicated by `(A)`, `(B)`, etc., at the beginning of the task body. `(A)` is the highest.
```
(A) Develop PWA for todo.txt
```

**With Creation Date:**
The creation date follows the priority (if present).
```
(A) 2025-04-01 Develop PWA for todo.txt
```

**With Projects and Contexts:**
Projects use `+ProjectName` and contexts use `@ContextName`.
```
(A) 2025-04-01 Develop PWA for todo.txt @Coding +WebApp
```

**With Extensions (like Due Date and Threshold Date):**
Key-value pairs like `due:YYYY-MM-DD` or `t:YYYY-MM-DD` (threshold/start date) are added at the end.
```
(A) 2025-04-01 Develop PWA for todo.txt @Coding +WebApp due:2025-10-27 t:2025-07-01
```

**Completed Task:**
Completed tasks start with an `x`, followed by the completion date, and then the original creation date (if it existed). Priority is usually removed upon completion.
```
x 2025-04-13 2025-04-01 Develop PWA for todo.txt @Coding +WebApp due:2025-10-27 t:2025-07-01
```

**Summary of Components:**

*   **`x`**: Marks the task as complete (optional).
*   **`YYYY-MM-DD` (Completion Date):** Date task was completed (only if marked 'x').
*   **`(A)`**: Priority (optional, A-Z).
*   **`YYYY-MM-DD` (Creation Date):** Date task was created (optional).
*   **Task Description:** The main text of your todo item.
*   **`+Project`**: Project tag (optional, multiple allowed).
*   **`@Context`**: Context tag (optional, multiple allowed).
*   **`key:value`**: Extension tags like `due:` or `t:` (optional, multiple allowed).

## Core Features

### Adding, Editing, and Deleting Tasks

*   **Adding:**
    1.  Select optional Priority, Project, Context using the dropdowns.
    2.  Select optional Creation and Due dates using the date pickers.
    3.  Type the task description in the main input field.
    4.  Click "Add Todo".
*   **Editing:**
    1.  Click the pencil icon (<i class="fa-solid fa-pen-to-square"></i>) next to the task you want to edit.
    2.  The task details will populate the input fields and dropdowns.
    3.  Make your changes.
    4.  Click "Save Edit".
*   **Deleting:**
    1.  Click the 'X' icon (<i class="fa-solid fa-times"></i>) next to the task you want to delete.

### Marking Tasks Complete/Incomplete

*   Click the checkmark icon (<i class="fa-solid fa-check"></i>) next to a task to toggle its completion status.
*   When a task is marked complete:
    *   An 'x' is added to the beginning.
    *   A completion date (today's date) is added.
    *   Any existing priority is removed.
*   When a task is marked incomplete:
    *   The 'x' is removed.
    *   The completion date is removed.

### Filtering Tasks

1.  Select a Priority, Project, or Context from the respective dropdowns above the main input field.
2.  Click the "Filter" button.
3.  The list will update to show only tasks matching *all* selected criteria.
4.  To clear the filter, ensure no Priority, Project, or Context is selected in the dropdowns and click "Filter" again (or reload the page).

### Display Options (Switches)

Below the input area, there are switches to control which tasks are displayed:

*   **Show Completed:**
    *   **ON (Default):** Displays all tasks, including completed ones (marked with 'x').
    *   **OFF:** Hides completed tasks.
*   **Threshold > Today:**
    *   **ON (Default):** Displays all tasks, regardless of their threshold date (`t:YYYY-MM-DD`).
    *   **OFF:** Hides tasks whose threshold date (`t:YYYY-MM-DD`) is in the future. This is useful for hiding tasks that aren't relevant until a later date.

### Managing Files

The application supports multiple `todo.txt` files synced via Dropbox.

*   **Accessing File Management:** Click the hamburger menu icon (<i class="fa-solid fa-bars"></i>) in the top-left corner to open the sidebar.
*   **Switching Files:** Click on a file name in the sidebar list to view and edit its tasks.
*   **Adding Files:**
    1.  Click the plus icon (<i class="fa-solid fa-plus"></i>) in the sidebar header.
    2.  Enter a name for the new file (e.g., `shopping.txt`). The `.txt` extension will be added if missing.
    3.  Click "Add File". A new, empty file will be created locally and on Dropbox (if connected).
*   **Renaming Files:**
    1.  Ensure the file you want to rename is currently active.
    2.  Click the pencil icon (<i class="fa-solid fa-pen-to-square"></i>) in the sidebar footer.
    3.  Enter the new name.
    4.  Click "Rename File". The file will be renamed locally and on Dropbox. (Note: The default `todo.txt` cannot be renamed).
*   **Deleting Files:**
    1.  Ensure the file you want to delete is currently active.
    2.  Click the 'X' icon (<i class="fa-solid fa-times"></i>) in the sidebar footer.
    3.  Confirm the deletion in the pop-up window. The file will be removed locally and from Dropbox. (Note: The default `todo.txt` cannot be deleted).
*   **Importing from Disk:**
    1. Click the upload icon (<i class="fa-solid fa-upload"></i>) in the sidebar header.
    2. Select a `.txt` file from your computer. Its contents will be added to the *currently active* todo list.

### Dropbox Synchronization

*   **Connecting:** Click the Dropbox icon (<i class="fa-brands fa-dropbox"></i>) in the top-right corner to connect your Dropbox account.
*   **Syncing:** Once connected, the app automatically syncs the *currently active* file with Dropbox. Changes made in the app are uploaded, and changes made elsewhere are downloaded. The sync status is shown next to the Dropbox icon.
*   **Conflict Resolution:** If the file has been modified both locally and on Dropbox since the last sync, a conflict resolution dialog will appear, allowing you to choose which version to keep.
*   **Offline:** If you are offline, changes are saved locally and will be synced when you reconnect.
*   **Disconnecting:** Click the disconnect icon (<i class="fa-solid fa-link-slash"></i>) (which replaces the Dropbox icon when connected) to log out.
