import { BasicRoller } from "src/rollers/roller";
import type { DiceRollerSettings } from "src/settings/settings.types";
import { CHAIN_RESULT_SEPARATOR } from "src/utils/constants";

export class ChainRoller extends BasicRoller {
    result: string;
    shouldShowFormula: boolean = false;
    subRollers: BasicRoller[] = [];

    constructor(
        data: DiceRollerSettings,
        original: string,
        subRollers: BasicRoller[],
        position = data.position
    ) {
        super(data, original, [] as any, position);
        this.subRollers = subRollers;
    }

    async build() {
        this.resultEl.empty();
        this.resultEl.setText(this.result ?? "");
    }

    async getReplacer() {
        let inline = this.shouldShowFormula ? `${this.inlineText} ` : "";
        return `${inline}${this.result}`;
    }

    getTooltip() {
        return this.subRollers.map((s) => s.getTooltip?.() ?? "").join("\n\n");
    }

    async roll() {
        this.rollSilent();
        this.render();
        this.trigger("new-result");
        return this.result;
    }

    async rollSilent() {
        let subResults = [];
        for (let i = 0; i < this.subRollers.length; ++i) {
            let subResult = await this.subRollers[i].rollSilent();
            subResults.push(subResult);
        }
        this.result = subResults.join(`${CHAIN_RESULT_SEPARATOR} `);

    }
}
