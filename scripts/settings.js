import { MODULE_ID } from "./const.js";

// per-world key so each world keeps its own bin
export function getBinSettingId() {
	return `${game.world.id}.bin`;
}

export function registerSettings() {
	// persisted bin; client scope keeps it per-browser and avoids non-GM world-write errors
	game.settings.register(MODULE_ID, getBinSettingId(), {
		scope: "client",
		config: false,
		type: Array,
		default: [],
	});

	// items that survive a reload
	game.settings.register(MODULE_ID, "maxPermanentItems", {
		name: `${MODULE_ID}.settings.maxPermanentItems.name`,
		hint: `${MODULE_ID}.settings.maxPermanentItems.hint`,
		scope: "world",
		config: true,
		type: Number,
		default: 20,
	});

	// items held in memory during a session before the oldest are dropped
	game.settings.register(MODULE_ID, "maxTemporaryItems", {
		name: `${MODULE_ID}.settings.maxTemporaryItems.name`,
		hint: `${MODULE_ID}.settings.maxTemporaryItems.hint`,
		scope: "world",
		config: true,
		type: Number,
		default: 100,
	});
}
