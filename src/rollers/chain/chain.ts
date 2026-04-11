import {
    Notice,
    App,
} from "obsidian";

import { CHAIN_RESULT_SEPARATOR, DICE_TRAY_NO_DICE_MSG, DICE_TRAY_NOT_SUPPORTED_MSG } from "src/utils/constants";
import type { DiceRollerSettings } from "src/settings/settings.types";
import { StackRoller } from "../dice/stack";
import { BasicRoller } from "../roller";

export class ChainRoller extends BasicRoller<string> {
    app: App;
    result: string;
    subRollers: BasicRoller[];

    private async onGetResult(allRollerTypesAllowed: boolean): Promise<{result: string, isValid: boolean}> {
        const results: string[] = [];
        let isValid = true;

        // Suppress workspace triggers while running sub-rolls to avoid the Dice Tray listener adding individual sub-roll entries.
        const workspace: any = this.app.workspace as any;
        const originalTrigger = workspace.trigger;
        try {
            workspace.trigger = () => {};

            if (allRollerTypesAllowed) {
                for (let i = 0; i < this.subRollers.length; ++i) {
                    await this.subRollers[i].roll();
                }
            } else {
                for (const roller of this.subRollers) {
                    if (roller instanceof (StackRoller)) {
                        roller.buildDiceTree();
                        if (!(roller.children && roller.children.length)) {
                            throw new Error(DICE_TRAY_NO_DICE_MSG);
                        }
                        await roller.roll();
                    } else {
                        isValid = false;
                        break;
                    }
                }
            }
        } catch(e) {
            console.error(e);
        } finally {
            workspace.trigger = originalTrigger;
        }

        for (const roller of this.subRollers) {
            try {
                const replacer = await roller.getReplacer?.();
                if (replacer) {
                    results.push(String(replacer));
                } else if ((roller as any).result !== undefined) {
                    results.push(String((roller as any).result));
                }
            } catch (e) {
                console.error(e);
            }
        }

        const result = isValid ? results.join(CHAIN_RESULT_SEPARATOR + " ") : "";
        return { result, isValid };
    }

    constructor(
        data: DiceRollerSettings,
        original: string,
        subRollers: BasicRoller[],
        app: App,
        position = data.position
    ) {
        super(data, original, [] as any, position);
        this.app = app;
        this.subRollers = subRollers;
    }

    async build() {
        this.resultEl.empty();
        this.resultEl.setText(this.result ?? "");
    }

    async getReplacer() {
        return this.result ?? "";
    }

    async getResult() {
        let allRollerTypesAllowed = true;
        let output = await this.onGetResult(allRollerTypesAllowed);
        return output.result;
    }

    async getResult_OnlyStackRollers(): Promise<{result: string, isValid: boolean}> {
        let onlyStackRollersAllowed = false;
        let output = await this.onGetResult(onlyStackRollersAllowed);
        return output;
    }

    getResultText(): string {
        return this.result ?? "";
    }

    getTooltip() {
        return this.subRollers.map((s) => s.getTooltip?.() ?? "").join("\n\n");
    }

    async roll() {
        this.result = await this.getResult();
        this.render();
        this.trigger("new-result");
        return this.result;
    }

    async roll_OnlyStackRollers() {
        const output = await this.getResult_OnlyStackRollers();
        if (!output.isValid) {
            new Notice(DICE_TRAY_NOT_SUPPORTED_MSG);
            return "";
        }
        this.result = output.result;
        this.render();
        this.trigger("new-result");
        return output.result;
    }
}
