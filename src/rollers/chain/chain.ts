import { BasicRoller, type RenderableRoller } from "src/rollers/roller";
import type { DiceRollerSettings } from "src/settings/settings.types";
import type { App } from "obsidian";
import { CHAINED_RESULT_SEPARATOR } from "src/utils/constants";

export class ChainRoller extends BasicRoller {
    result: string;
    shouldShowFormula: boolean = false;
    subRollers: BasicRoller[] = [];
    app: App;

    private async executeRoll() {
        let subResults = [];
        for (let i = 0; i < this.subRollers.length; ++i) {
            const subRoller = this.subRollers[i] as any;
            const subResult = await (subRoller.callSilent?.() ?? (this.subRollers[i] as any).callSilent?.());
            let textResult: string;
            try {
                if (typeof subResult === "string") {
                    textResult = subResult;
                } else if (typeof subRoller.getResultText === "function") {
                    textResult = subRoller.getResultText();
                } else if (typeof subRoller.transformResultsToString === "function") {
                    textResult = subRoller.transformResultsToString();
                } else if (subRoller && typeof subRoller.result === "string") {
                    textResult = subRoller.result as string;
                } else {
                    textResult = JSON.stringify(subResult);
                }
            } catch(e) {
                textResult = String(subResult);
            }
            subResults.push(textResult);
        }
        const separator = (this.data && (this.data as any).chainedResultSeparator) ?? CHAINED_RESULT_SEPARATOR;
        return subResults.join(`${separator} `);
    }

    constructor(
        data: DiceRollerSettings,
        original: string,
        subRollers: BasicRoller[],
        app: App,
        position = data.position
    ) {
        super(data, original, [] as any, position);
        this.subRollers = subRollers;
        this.app = app;
    }

    addContexts(...components: any[]) {
        super.addContexts(...components);
        for (const s of this.subRollers) {
            if ((s as any).addContexts) {
                (s as any).addContexts(...components);
            }
        }
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
        this.result = await this.executeRoll();
        this.render();
        this.trigger("new-result");

        // Create a thin wrapper that exposes only the members listeners use.
        const wrapper: Partial<RenderableRoller<any>> = {
            getSource: () => (typeof (this as any).getSource === "function" ? (this as any).getSource() : ""),
            getResultText: () => (this as any).getResultText?.() ?? `${this.result}`,
            getTooltip: () => this.getTooltip(),
            original: (this as any).original
        };
        this.app.workspace.trigger("dice-roller:new-result", wrapper as RenderableRoller<any>);

        return this.result;
    }

    async rollSilent() {
        this.result = await this.executeRoll()
        return this.result;
    }

    getResultText(): string {
        return `${this.result}`;
    }
}
