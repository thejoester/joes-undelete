# Joe's Undelete

A recycle bin for Foundry VTT. When a document is deleted, Joe's Undelete keeps a copy so you can preview it and restore it.

Requires Foundry VTT v14.

## Installation

In Foundry's setup screen, go to **Add-on Modules**, click **Install Module**, paste this manifest URL, and click **Install**:

```
https://github.com/thejoester/joes-undelete/releases/latest/download/module.json
```

Then enable **Joe's Undelete** in your world.

## Opening the bin

Click the **Joe's Undelete** button in the Settings sidebar.

You can also open it from a script macro:

```js
game.modules.get("joes-undelete").api.open();
```

## What gets saved

The bin catches world documents (actors, items, scenes, journals, chat messages and so on) and the documents embedded in them, such as an item on an actor or a token in a scene.

- A GM's bin collects deletions made while that GM is connected to the world.
- A player's bin collects only the deletions that player makes.

Anything deleted before the module was enabled can't be recovered.

## Using the bin

Entries are listed newest first, with the document type, name, parent and how long ago it was deleted. The search box filters by type, name or parent. The window title shows how many entries are in the bin.

Each entry has three buttons:

- **Restore Item** recreates the document with its original ID, inside its original parent if it had one. If the parent is also gone but is still in the bin, you'll be asked whether to restore it too. Foundry's permissions still apply, so a restore will fail if you aren't allowed to create that document.
- **Preview Item** opens a read-only view without restoring anything. Chat messages open in a simple window. An embedded document can only be previewed while its parent still exists.
- **Permanently Delete Item** removes the entry from the bin after you confirm.

The **Delete All** button next to the search box empties the bin after you confirm. Permanent deletion can't be undone.

## Settings

| Setting | Default | What it does |
|---|---|---|
| Maximum Permanent History | 20 | How many of the newest entries are saved between reloads. |
| Maximum Temporary History | 100 | How many entries the bin holds during a session. The oldest is dropped when the bin is full. |

When the bin holds more entries than the permanent limit, the window title shows a ❗ and the older entries are marked. Those marked entries will be gone after a reload, so restore anything you need first.

## Where the bin is stored

The bin is saved in your browser, with a separate bin for each world. It doesn't follow you to another browser or computer, and clearing your browser's site data will erase it. It is meant for recovering from mistakes, so keep making regular backups of your world.
