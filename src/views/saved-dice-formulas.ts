import { ExtraButtonComponent, ItemView, WorkspaceLeaf, TextComponent } from "obsidian";
import type DiceRollerPlugin from "src/main";
import { Icons } from "src/utils/icons";
import { API } from "src/api/api";

export const VIEW_TYPE_SAVED_DICE_FORMULAS = "DICE_SAVED_FORMULAS_VIEW";

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
        header.createEl("h4", { cls: "results-header", text: "Saved Dice Formulas" });

        const container = this.contentEl.createDiv("saved-formulas-container");

        const formulas = this.plugin.data.formulas ?? {};

        const entries = Object.entries(formulas);
        if (!entries.length) {
            container.createSpan({ text: "No saved dice formulas yet." });
            return;
        }

        for (const [alias, formula] of entries) {
            const row = container.createDiv("saved-formula-row");
            const label = row.createDiv("saved-formula-label");
            label.createSpan({ text: alias, cls: "saved-formula-alias" });
            label.createSpan({ text: formula, cls: "saved-formula-expression" });

            const actions = row.createDiv("saved-formula-actions");
            new ExtraButtonComponent(actions)
                .setIcon(Icons.DICE)
                .setTooltip("Roll")
                .onClick(async () => {
                    const roller = await API.getRoller(formula, VIEW_TYPE_SAVED_DICE_FORMULAS);
                    if (roller) {
                        await roller.roll().catch(() => {});
                    }
                });

            new ExtraButtonComponent(actions)
                .setIcon(Icons.EDIT)
                .setTooltip("Edit")
                .onClick(async () => {
                    row.empty();
                    row.addClass("saved-formula-edit");

                    const aliasEl = row.createDiv("saved-formula-edit-alias");
                    const exprEl = row.createDiv("saved-formula-edit-expression");
                    const actionsEl = row.createDiv("saved-formula-actions");

                    const toSave = { alias, formula };

                    const aliasInput = new TextComponent(aliasEl)
                        .setPlaceholder("Alias")
                        .setValue(toSave.alias)
                        .onChange((v) => (toSave.alias = v));

                    const exprInput = new TextComponent(exprEl)
                        .setPlaceholder("Formula")
                        .setValue(toSave.formula)
                        .onChange((v) => (toSave.formula = v));

                    const doneBtn = new ExtraButtonComponent(actionsEl)
                        .setIcon(Icons.DONE)
                        .onClick(async () => {
                            if (!toSave.alias || !toSave.formula) return;
                            // If alias changed, remove old key
                            if (toSave.alias !== alias) {
                                delete this.plugin.data.formulas[alias];
                            }
                            this.plugin.data.formulas[toSave.alias] = toSave.formula;
                            await this.plugin.saveSettings();
                            this.render();
                        });

                    new ExtraButtonComponent(actionsEl)
                        .setIcon(Icons.CANCEL)
                        .onClick(() => this.render());
                });

            new ExtraButtonComponent(actions)
                .setIcon(Icons.DELETE)
                .setTooltip("Delete")
                .onClick(async () => {
                    delete this.plugin.data.formulas[alias];
                    await this.plugin.saveSettings();
                    this.render();
                });
        }
    }

    getDisplayText() {
        return "Saved Dice Formulas";
    }

    getViewType() {
        return VIEW_TYPE_SAVED_DICE_FORMULAS;
    }

    getIcon() {
        return Icons.SAVE;
    }
}
