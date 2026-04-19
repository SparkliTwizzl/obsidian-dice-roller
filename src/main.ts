import { Plugin, Notice, WorkspaceLeaf } from "obsidian";

import { StackRoller } from "./rollers/dice/stack";

import SettingTab from "./settings/settings";

import DiceTrayView, { VIEW_TYPE_DICE_TRAY } from "./views/dice-tray";
import SavedFormulasView, { VIEW_TYPE_SAVED_DICE_FORMULAS } from "./views/saved-dice-formulas";
import { DiceRenderer, type RendererData } from "./renderer/renderer";
import { Lexer } from "./lexer/lexer";
import { inlinePlugin } from "./processor/live-preview";
import { API } from "./api/api";
import {
    ButtonPosition,
    type DiceRollerSettings
} from "./settings/settings.types";
import { DEFAULT_SETTINGS } from "./settings/settings.const";
import { DataviewManager } from "./api/api.dataview";
import DiceProcessor from "./processor/processor";
import copy from "fast-copy";
import { compare } from "compare-versions";

export default class DiceRollerPlugin extends Plugin {
    api = API;

    data: DiceRollerSettings;
    processor: DiceProcessor;

    getRendererData(): RendererData {
        return {
            diceColor: this.data.diceColor,
            textColor: this.data.textColor,
            narrativeSymbolSet: this.data.narrativeSymbolSet,
            colorfulDice: this.data.colorfulDice,
            scaler: this.data.scaler,
            renderTime: this.data.renderTime,
            textFont: this.data.textFont
        };
    }
    async onload() {
        await this.loadSettings();
        console.log(`DiceRoller v${this.data.version} loaded`);

        DiceRenderer.setData(this.getRendererData());

        this.api.initialize(this.data, this.app);

        window["DiceRoller"] = this.api;
        this.register(() => delete window["DiceRoller"]);
        this.addChild(DataviewManager.initialize(this.app));

        Lexer.setDefaults(this.data.defaultRoll, this.data.defaultFace);

        this.addSettingTab(new SettingTab(this.app, this));

        this.registerView(
            VIEW_TYPE_DICE_TRAY,
            (leaf: WorkspaceLeaf) => new DiceTrayView(this, leaf)
        );

        this.registerView(
            VIEW_TYPE_SAVED_DICE_FORMULAS,
            (leaf: WorkspaceLeaf) => new SavedFormulasView(this, leaf)
        );

        this.registerEvent(
            this.app.workspace.on("dice-roller:render-dice", async (roll) => {
                const roller = await API.getRoller(roll, "external");
                if (roller == null) {
                    return;
                }
                if (!(roller instanceof StackRoller)) {
                    new Notice("The Dice Tray only supports dice rolls.");
                    return;
                }
                await roller.roll();
                if (!roller.children.length) {
                    new Notice("Invalid formula.");
                    return;
                }
                try {
                    await roller.roll(true);
                } catch (e) {
                    new Notice("There was an error rendering the roll.");
                    console.error(e);
                }

                this.app.workspace.trigger(
                    "dice-roller:rendered-result",
                    roller.result
                );
            })
        );

        this.addCommand({
            id: "open-view",
            name: "Open Dice Tray",
            callback: () => {
                if (!this.diceTrayView) {
                    this.addDiceTrayView();
                } else {
                    this.app.workspace.revealLeaf(this.diceTrayView.leaf);
                }
            }
        });

        this.addCommand({
            id: "open-saved-dice-formulas-tab",
            name: "Open Saved Dice Formulas Tab",
            callback: async () => {
                if (!this.savedFormulasView) {
                    this.addSavedFormulasView();
                } else {
                    this.app.workspace.revealLeaf(this.savedFormulasView.leaf);
                }
            }
        });

        this.processor = new DiceProcessor();
        this.processor.initialize(this);

        this.registerMarkdownPostProcessor((el, ctx) =>
            this.processor.postprocessor(el, ctx)
        );
        this.registerEditorExtension([inlinePlugin(this)]);

        this.app.workspace.onLayoutReady(async () => {
            this.addDiceTrayView(true);
            this.addSavedFormulasView(true);
        });

        this.app.workspace.trigger("dice-roller:loaded");
    }

    get diceTrayView() {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DICE_TRAY);
        const leaf = leaves.length ? leaves[0] : null;
        if (leaf && leaf.view && leaf.view instanceof DiceTrayView)
            return leaf.view;
    }

    get savedFormulasView() {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_SAVED_DICE_FORMULAS);
        const leaf = leaves.length ? leaves[0] : null;
        if (leaf && leaf.view && leaf.view instanceof SavedFormulasView)
            return leaf.view;
    }

    async addDiceTrayView(startup = false) {
        if (startup && !this.data.showDiceTrayViewOnStartup) return;
        if (this.app.workspace.getLeavesOfType(VIEW_TYPE_DICE_TRAY).length) {
            return;
        }
        await this.app.workspace.getRightLeaf(false).setViewState({
            type: VIEW_TYPE_DICE_TRAY
        });
    }

    async addSavedFormulasView(startup = false) {
        if (startup && !this.data.showSavedFormulasViewOnStartup) return;
        if (this.app.workspace.getLeavesOfType(VIEW_TYPE_SAVED_DICE_FORMULAS).length) {
            return;
        }
        await this.app.workspace.getRightLeaf(false).setViewState({
            type: VIEW_TYPE_SAVED_DICE_FORMULAS
        });
    }

    async loadSettings() {
        const data = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        let dirty = false;

        if (typeof data.version !== "string") {
            delete data.version;
        }
        if (
            compare("11.2.0", data.version ?? "0.0.0", ">") &&
            !("position" in data)
        ) {
            data.position = data.showDice
                ? ButtonPosition.RIGHT
                : ButtonPosition.NONE;
            delete data["showDice"];

            dirty = true;
        }
        if (compare("11.0.0", data.version ?? "0.0.0", ">")) {
            delete data["persistResults"];
            delete data["results"];
            dirty = true;
        }
        if (compare(data.version ?? "0.0.0", this.manifest.version, "!=")) {
            data.version = this.manifest.version;
            dirty = true;
        }

        this.data = copy(data);

        if (dirty) {
            await this.saveSettings();
        }
    }
    async saveSettings() {
        await this.saveData(this.data);
    }

    /**
     * @deprecated
     */
    async getArrayRoller(options: any[], rolls = 1) {
        new Notice(
            "Using the Dice Roller plugin directly will be deprecated in a future version. Please use `window.DiceRoller` instead."
        );
        return this.api.getArrayRoller(options, rolls);
    }

    onunload() {
        console.log("DiceRoller unloaded");
        this.app.workspace
            .getLeavesOfType(VIEW_TYPE_DICE_TRAY)
            .forEach((leaf) => leaf.detach());

        if ("__THREE__" in window) {
            delete window.__THREE__;
        }
        this.app.workspace.trigger("dice-roller:unloaded");
    }
}
