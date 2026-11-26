import { MODULE_ID } from "./const.js";
import { getBinSettingId } from "./settings.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

// documentName -> embedded document implementation class, filled by discoverEmbeddedTypes()
const EMBEDDED_IMPL = {};

export class UndeleteApp extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: MODULE_ID,
		tag: "div",
		window: {
			title: `${MODULE_ID}.app.title`,
			icon: "fa-duotone fa-trash-undo",
			resizable: true,
		},
		position: { width: 720, height: 600 },
	};

	static PARTS = {
		content: { template: `modules/${MODULE_ID}/templates/undelete.hbs` },
	};

	constructor() {
		super();
		this._bin = [];
		this._search = "";
		this.loadSavedBin();
		this.setHooks();
	}

	// title carries the live count and a warning when the bin is over the saved limit
	get title() {
		const base = game.i18n.localize(`${MODULE_ID}.app.title`);
		const over = this._bin.length > game.settings.get(MODULE_ID, "maxPermanentItems");
		return `${base} | ${this._bin.length}${over ? " ❗" : ""}`;
	}

	// load the persisted bin from the client setting
	loadSavedBin() {
		this._bin = game.settings.get(MODULE_ID, getBinSettingId()) || [];
	}

	// register a delete handler for every world and embedded document type
	setHooks() {
		// GM captures after deletion, players capture just before (their own client only)
		const phase = game.user.isGM ? "delete" : "preDelete";
		const types = [...CONST.WORLD_DOCUMENT_TYPES].concat(this.discoverEmbeddedTypes());
		for (const type of types) {
			Hooks.on(`${phase}${type}`, (doc) => {
				const data = doc.toObject();
				data._parent = doc?.parent?.uuid;
				data._documentName = doc.documentName;
				data._deleteTime = Date.now();
				data._uuid = doc.uuid;
				this.addItem(data);
			});
		}
	}

	// discover embedded document types from each world document's schema hierarchy
	discoverEmbeddedTypes() {
		const found = new Set();
		for (const type of CONST.WORLD_DOCUMENT_TYPES) {
			const hierarchy = CONFIG[type]?.documentClass?.hierarchy ?? {};
			for (const field of Object.values(hierarchy)) {
				const name = field?.element?.documentName;
				if (!name) continue;
				found.add(name);
				EMBEDDED_IMPL[name] = field.element.implementation;
			}
		}
		return Array.from(found);
	}

	// resolve a bin entry from either an index or the object itself
	getItem(ref) {
		if (Number.isInteger(ref)) ref = this._bin[ref];
		return this._bin.includes(ref) ? ref : null;
	}

	// add a serialized deleted document to the bin, de-duping by uuid
	addItem(data) {
		if (this._bin.find((i) => i._uuid === data._uuid)) return;
		this._bin.push(data);
		const maxTemp = game.settings.get(MODULE_ID, "maxTemporaryItems");
		if (this._bin.length > maxTemp) this._bin.shift();
		this.savePermanentItems();
	}

	// persist the newest maxPermanentItems entries and refresh the window if open
	async savePermanentItems() {
		const max = game.settings.get(MODULE_ID, "maxPermanentItems");
		const saved = this._bin.slice(-max);
		await game.settings.set(MODULE_ID, getBinSettingId(), saved);
		if (this.rendered) this.render(true);
	}

	// display name for a bin entry, with sensible fallbacks
	getItemName(item) {
		item = this.getItem(item) ?? item;
		if (!item) return "";
		// chat messages have no name; use a stripped snippet of their content
		let snippet;
		if (item._documentName === "ChatMessage" && item.content) {
			snippet = item.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || undefined;
		}
		return item.name ?? item.title ?? item.speaker?.alias ?? snippet ?? this.getItemImageName(item) ?? item._id ?? item.id ?? "";
	}

	// last path segment of an entry's image, used as a name fallback
	getItemImageName(item) {
		const src = item.img ?? item.thumb ?? item.texture?.src ?? item.icon;
		return src ? src.split("/").pop() : null;
	}

	// image path for an entry, or a FontAwesome icon class when no image exists
	getItemImage(item) {
		const src = item.img ?? item.thumb ?? item.texture?.src ?? item.icon;
		if (src) return src;
		if (!item._documentName) return "fa-duotone fa-file";
		const layerIcon = Object.values(CONFIG.Canvas.layers)
			.find((l) => l.layerClass?.documentName === item._documentName)
			?.layerClass?.prepareSceneControls?.()?.icon;
		return CONFIG[item._documentName]?.sidebarIcon ?? layerIcon ?? "fa-duotone fa-file";
	}

	async _prepareContext() {
		const max = game.settings.get(MODULE_ID, "maxPermanentItems");
		const timeLabel = game.i18n.localize(`${MODULE_ID}.app.time`);
		const items = [];
		for (const entry of this._bin) {
			const elapsed = Date.now() - (entry._deleteTime ?? Date.now());
			const d = new Date(elapsed);
			const time = timeLabel.replace("{time}", `${d.getUTCDate() - 1}d ${d.getUTCHours()}h ${d.getUTCMinutes()}m`);
			// getItemImage returns either a real path or a FontAwesome class
			const src = this.getItemImage(entry);
			const isIcon = !src.includes(".");
			const index = this._bin.indexOf(entry);
			let parent = game.i18n.localize(`${MODULE_ID}.app.noParent`);
			if (entry._parent) {
				const parentDoc = await fromUuid(entry._parent).catch(() => null);
				parent = `${this.getItemName(parentDoc) || ""} | ${entry._parent}`;
			}
			items.push({
				index,
				parent,
				name: this.getItemName(entry),
				img: isIcon ? null : src,
				icon: isIcon ? src : null,
				documentName: entry._documentName ?? "Unknown",
				time,
				willBeDeleted: index < this._bin.length - max,
			});
		}
		// newest first for display; data-index still points at the real bin position
		items.reverse();
		return { items };
	}

	_onRender(context, options) {
		super._onRender(context, options);
		this._updateFrame?.({ window: { title: this.title } });
		const root = this.element;

		root.querySelectorAll(".restore-item").forEach((el) => {
			el.addEventListener("click", async (ev) => {
				const index = parseInt(ev.target.closest("li").dataset.index);
				await this.restoreItem(index);
			});
		});

		root.querySelectorAll(".preview-item").forEach((el) => {
			el.addEventListener("click", async (ev) => {
				const index = parseInt(ev.target.closest("li").dataset.index);
				await this.previewItem(index);
			});
		});

		root.querySelectorAll(".permanently-delete").forEach((el) => {
			el.addEventListener("click", async (ev) => {
				const index = parseInt(ev.target.closest("li").dataset.index);
				const confirmed = await DialogV2.confirm({
					window: { title: `${game.i18n.localize(`${MODULE_ID}.dialog.permanentlyDelete.title`)} | ${this.getItemName(index)}` },
					content: `<p>${game.i18n.localize(`${MODULE_ID}.dialog.permanentlyDelete.content`)}</p>`,
				});
				if (confirmed) this.deleteForever(index);
			});
		});

		root.querySelector(".delete-all")?.addEventListener("click", () => this.deleteAll());

		const search = root.querySelector("#search");
		search.value = this._search;
		this._onSearch();
		const onInput = (ev) => {
			this._search = ev.target.value.toLowerCase();
			this._onSearch();
		};
		search.addEventListener("keyup", onInput);
		search.addEventListener("search", onInput);
	}

	// hide list rows that do not match the current search term
	_onSearch() {
		const term = this._search;
		this.element.querySelectorAll("li").forEach((li) => {
			const match = !term || (li.dataset.search || "").toLowerCase().includes(term);
			li.classList.toggle("hidden", !match);
		});
	}

	// recreate a deleted document; offers to restore a missing parent from the bin
	async restoreItem(ref) {
		const item = this.getItem(ref);
		if (!item) return;
		const documentName = item._documentName;
		const parentUuid = item._parent;
		// keep metadata so we can put it back if the restore fails
		const meta = {
			_documentName: item._documentName,
			_parent: item._parent,
			_deleteTime: item._deleteTime,
			_uuid: item._uuid,
		};
		delete item._documentName;
		delete item._parent;
		delete item._deleteTime;
		delete item._uuid;

		try {
			if (parentUuid) {
				let parentDoc = await fromUuid(parentUuid).catch(() => null);
				if (!parentDoc) {
					const parentEntry = this._bin.find((e) => e._uuid === parentUuid);
					let restoredParent = false;
					if (parentEntry) {
						const yes = await DialogV2.confirm({
							window: { title: `${game.i18n.localize(`${MODULE_ID}.dialog.restoreParent.title`)} | ${this.getItemName(parentEntry)}` },
							content: `<p>${game.i18n.localize(`${MODULE_ID}.dialog.restoreParent.content`)}</p>`,
						});
						if (yes) {
							await this.restoreItem(parentEntry);
							restoredParent = true;
						}
					}
					if (!restoredParent) {
						Object.assign(item, meta);
						ui.notifications.error(`${game.i18n.localize(`${MODULE_ID}.error.restore`).replace("{item}", `${documentName} - ${this.getItemName(item)}`)} ${parentUuid}`);
						return;
					}
					parentDoc = await fromUuid(parentUuid).catch(() => null);
				}
				if (!parentDoc) {
					Object.assign(item, meta);
					return;
				}
				await parentDoc.createEmbeddedDocuments(documentName, [item], { keepId: true });
			} else {
				await CONFIG[documentName].documentClass.create(item, { keepId: true });
			}
			ui.notifications.info(game.i18n.localize(`${MODULE_ID}.success.restore`).replace("{item}", `${documentName} - ${this.getItemName(item)}`));
			this.deleteForever(item);
		} catch (err) {
			console.error(`${MODULE_ID} | restore failed`, err);
			Object.assign(item, meta);
			ui.notifications.error(game.i18n.localize(`${MODULE_ID}.error.restore`).replace("{item}", `${documentName} - ${this.getItemName(item)}`));
		}
	}

	// open a read-only sheet for a bin entry without recreating it
	async previewItem(ref) {
		const item = this.getItem(ref);
		if (!item) return;
		try {
			const clone = foundry.utils.deepClone(item);
			const documentName = clone._documentName;
			const parentUuid = clone._parent;
			delete clone._documentName;
			delete clone._parent;
			delete clone._deleteTime;
			delete clone._uuid;
			let doc;
			if (parentUuid) {
				const parentDoc = await fromUuid(parentUuid);
				const parentClone = new CONFIG[parentDoc.documentName].documentClass(parentDoc.toObject());
				const Impl = EMBEDDED_IMPL[documentName] ?? CONFIG[documentName]?.documentClass;
				doc = new Impl(clone, { parent: parentClone });
			} else {
				doc = new CONFIG[documentName].documentClass(clone);
			}
			if (documentName === "ChatMessage") {
				// chat messages have no real sheet; render the message HTML into a dialog
				const el = await doc.renderHTML();
				const content = el instanceof HTMLElement ? el.outerHTML : String(doc.content ?? "");
				await DialogV2.prompt({
					window: { title: `${documentName} - ${this.getItemName(item)}` },
					content: `<div class="chat-log" style="max-height:60vh;overflow:auto">${content}</div>`,
					ok: { label: "Close" },
				});
			} else if (doc.sheet) {
				// this is a preview of a throwaway clone with no real collection, so force
				// the sheet read-only: isEditable=false keeps PF2e from mounting collaborative
				// ProseMirror editors (which need a persisted doc) and stops submit-on-close
				// from writing to a doc/embedded effects that do not exist in the backend
				const sheet = doc.sheet;
				Object.defineProperty(sheet, "isEditable", { value: false, configurable: true });
				sheet.options.editable = false;
				const noop = async () => {};
				sheet.submit = noop;
				sheet._onSubmit = noop;
				sheet._updateObject = noop;
				sheet.render(true);
			} else {
				ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.error.noPreview`));
			}
		} catch (err) {
			console.error(`${MODULE_ID} | preview failed`, err);
			ui.notifications.error(game.i18n.localize(`${MODULE_ID}.error.preview`).replace("{item}", this.getItemName(item)));
		}
	}

	// empty the entire bin after confirmation
	async deleteAll() {
		if (!this._bin.length) return;
		const confirmed = await DialogV2.confirm({
			window: { title: game.i18n.localize(`${MODULE_ID}.dialog.deleteAll.title`) },
			content: `<p>${game.i18n.localize(`${MODULE_ID}.dialog.deleteAll.content`)}</p>`,
		});
		if (!confirmed) return;
		this._bin = [];
		this.savePermanentItems();
	}

	// drop an entry from the bin permanently
	deleteForever(ref) {
		const item = this.getItem(ref);
		const index = this._bin.indexOf(item);
		if (index > -1) this._bin.splice(index, 1);
		this.savePermanentItems();
	}

	// add an entry button to the Settings sidebar, alongside Foundry's own buttons
	static setSidebarButton() {
		Hooks.on("renderSettings", (app, root) => {
			// players get the button too; they capture their own deletions via preDelete
			// and the bin is client-scoped, so no world-write permission is needed
			if (root.querySelector(".joes-undelete-open")) return;
			const btn = document.createElement("button");
			btn.type = "button";
			btn.classList.add("joes-undelete-open");
			btn.innerHTML = `<i class="fa-duotone fa-trash-undo"></i> ${game.i18n.localize(`${MODULE_ID}.app.title`)}`;
			btn.addEventListener("click", () => game.joeUndelete?.render(true));
			const anchor = root.querySelector("section.settings") ?? root;
			anchor.append(btn);
		});
	}
}
