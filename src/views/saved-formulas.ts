import { ExtraButtonComponent, ItemView, WorkspaceLeaf } from "obsidian";
import type DiceRollerPlugin from "src/main";
import { Icons } from "src/utils/icons";
import { API } from "src/api/api";

export const VIEW_TYPE_SAVED_FORMULAS = "DICE_SAVED_FORMULAS_VIEW";

export default class SavedFormulasView extends ItemView {
    constructor(public plugin: DiceRollerPlugin, public leaf: WorkspaceLeaf) {
        super(leaf);
        this.contentEl.addClass("dice-saved-formulas-view");
    }

    async onOpen() {
        this.render();
    }

    render() {
        this.contentEl.empty();
        const header = this.contentEl.createDiv("results-header-container");
        header.createEl("h4", { cls: "results-header", text: "Saved Formulas" });

        const container = this.contentEl.createDiv("saved-formulas-container");

        if (!this.plugin.data.customFormulas?.length) {
            container.createSpan({ text: "No saved formulas yet." });
            return;
        }

        for (let i = 0; i < this.plugin.data.customFormulas.length; i++) {
            const formula = this.plugin.data.customFormulas[i];
            const row = container.createDiv("saved-formula-row");
            const label = row.createDiv("saved-formula-label");
            label.createSpan({ text: formula });

            const actions = row.createDiv("saved-formula-actions");
            new ExtraButtonComponent(actions)
                .setIcon(Icons.DICE)
                .setTooltip("Roll")
                .onClick(async () => {
                    const roller = await API.getRoller(formula, VIEW_TYPE_SAVED_FORMULAS);
                    if (roller) {
                        await roller.roll().catch(() => {});
                    }
                });

            new ExtraButtonComponent(actions)
                .setIcon(Icons.DELETE)
                .setTooltip("Delete")
                .onClick(async () => {
                    this.plugin.data.customFormulas.splice(i, 1);
                    await this.plugin.saveSettings();
                    this.render();
                });
        }
    }

    getDisplayText() {
        return "Saved Formulas";
    }

    getViewType() {
        return VIEW_TYPE_SAVED_FORMULAS;
    }

    getIcon() {
        return Icons.SAVE;
    }
}
