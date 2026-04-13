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
        const rawSeparator = (this.data && (this.data as any).chainedResultSeparator) ?? CHAINED_RESULT_SEPARATOR;

        const interpretEscapes = (s: string) =>
            s
                .replace(/\\r/g, "\r")
                .replace(/\\n/g, "\n")
                .replace(/\\t/g, "\t");

        const decodedSeparator = interpretEscapes(rawSeparator);

        // Display joiner: decoded separator, with a space unless it contains a newline.
        const displayJoiner = decodedSeparator.includes("\n") ? decodedSeparator : `${decodedSeparator} `;

        // Inline joiners by default preserve literal text for inline replacers and
        // escape any actual newline/tab characters to printable representations.
        const escapeActual = (s: string) =>
            s.replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t");

        const allowLineBreaks = (this.data && (this.data as any).allowChainedSeparatorLineBreaks) ?? false;

        let inlineJoiner: string;
        if (allowLineBreaks) {
            inlineJoiner = displayJoiner;
        } else {
            const shouldEscapeActual = rawSeparator.includes("\n") || rawSeparator.includes("\r") || rawSeparator.includes("\t");
            const inlineSeparator = shouldEscapeActual ? escapeActual(rawSeparator) : rawSeparator;
            inlineJoiner = `${inlineSeparator} `;
        }

        const inlineResult = subResults.join(inlineJoiner);
        const displayResult = subResults.join(displayJoiner);

        (this as any)._chainedInlineResult = inlineResult;
        (this as any)._chainedDisplayResult = displayResult;

        return inlineResult;
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
        // If this roller is being displayed as an embed, show the decoded/display result
        // (which may contain real newlines). Otherwise show the inline literal result.
        const displayText = (this.data && (this.data as any).displayAsEmbed)
            ? ((this as any)._chainedDisplayResult ?? this.result)
            : (this as any)._chainedInlineResult ?? this.result;

        this.resultEl.setText(displayText ?? "");
        if (displayText && displayText.includes("\n")) {
            (this.resultEl.style as any).whiteSpace = "pre-wrap";
        }
    }

    async getReplacer() {
        let inline = this.shouldShowFormula ? `${this.inlineText} ` : "";
        const inlineText = (this as any)._chainedInlineResult ?? this.result ?? "";
        // Ensure accidental real newlines are represented as literal escapes in
        // inline replacers unless the user explicitly allows line breaks.
        const allowLineBreaks = (this.data && (this.data as any).allowChainedSeparatorLineBreaks) ?? false;
        const normalized = allowLineBreaks ? inlineText : inlineText.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
        return `${inline}${normalized}`;
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
        this.result = await this.executeRoll();
        return this.result;
    }

    getResultText(): string {
        // Dice Tray / external consumers should get the decoded/display result so newlines render.
        return `${(this as any)._chainedDisplayResult ?? this.result}`;
    }
}
