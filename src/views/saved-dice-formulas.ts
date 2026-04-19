import { ExtraButtonComponent, ItemView, WorkspaceLeaf, TextComponent, Notice } from "obsidian";
import { CONFIRM_TIMEOUT_MILLISECONDS, CONFIRM_TIMEOUT_SECONDS } from "src/utils/constants";
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
        const header = this.contentEl.createDiv("saved-formulas-header-container");
        header.createEl("h3", { cls: "saved-formulas-header", text: "Saved Dice Formulas" });

        this.contentEl.createDiv("saved-formulas-divider");

        const container = this.contentEl.createDiv("saved-formulas-container");
        const formulas = this.plugin.data.formulas ?? {};

        const entries = Object.entries(formulas);
        if (!entries.length) {
            container.createSpan({ text: "No saved dice formulas yet." });
            return;
        }

        for (const [alias, formula] of entries) {

            const row = container.createDiv("saved-formula-row");

            const roll = row.createDiv("saved-formula-roll");
            new ExtraButtonComponent(roll)
                .setIcon(Icons.DICE)
                .setTooltip("Roll")
                .onClick(async () => {
                    const roller = await API.getRoller(formula, VIEW_TYPE_SAVED_DICE_FORMULAS);
                    if (roller) {
                        await roller.roll().catch(() => {});
                    }
                });

            const label = row.createDiv("saved-formula-label");
            label.createSpan({ text: alias, cls: "saved-formula-alias" });
            label.createSpan({ text: formula, cls: "saved-formula-expression" });

            const actions = row.createDiv("saved-formula-actions");

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
                        .setIcon(Icons.SAVE)
                        .setTooltip("Save")
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
                        .setTooltip("Cancel")
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

        this.contentEl.createDiv("saved-formulas-divider");

        const footer = this.contentEl.createDiv("saved-formulas-footer");
        const clearBtnWrap = footer.createDiv("clear-saved-formulas");
        clearBtnWrap.createSpan({ cls: "clear-saved-formulas-label", text: "Clear All Saved Formulas" });
        const clearBtn = new ExtraButtonComponent(clearBtnWrap)
            .setIcon(Icons.DELETE)
            .setTooltip("Clear All Saved Formulas");

        clearBtn.onClick(async () => {
            const key = "__formulas_reset_confirm";
            if ((clearBtn as any)[key]) {
                this.plugin.data.formulas = {};
                await this.plugin.saveSettings();
                new Notice("Saved formulas cleared.");
                this.render();
                return;
            }

            (clearBtn as any)[key] = true;
            try {
                clearBtn.setIcon(Icons.WARNING).setTooltip(`Click again within ${CONFIRM_TIMEOUT_SECONDS} seconds to confirm`);
            } catch (e) {}
            new Notice(`This is a destructive action. Click the button again within ${CONFIRM_TIMEOUT_SECONDS} seconds to confirm.`);
            setTimeout(() => {
                (clearBtn as any)[key] = false;
                try {
                    clearBtn.setIcon(Icons.DELETE).setTooltip("Clear All Saved Formulas");
                } catch (e) {}
            }, CONFIRM_TIMEOUT_MILLISECONDS);
        });
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
