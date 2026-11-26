import { MODULE_ID } from "./const.js";
import { registerSettings } from "./settings.js";
import { UndeleteApp } from "./undelete.js";

Hooks.once("init", () => {
	registerSettings();
	UndeleteApp.setSidebarButton();
});

Hooks.once("ready", () => {
	game.joeUndelete = new UndeleteApp();
	// expose a small API for macros
	const mod = game.modules.get(MODULE_ID);
	if (mod) mod.api = { open: () => game.joeUndelete.render(true) };
});
