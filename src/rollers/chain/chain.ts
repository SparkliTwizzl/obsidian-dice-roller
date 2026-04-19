import { BasicRoller, type RenderableRoller } from "src/rollers/roller";
import type { DiceRollerSettings } from "src/settings/settings.types";
import type { App } from "obsidian";
import { RESULT_SEPARATOR } from "src/utils/constants";

export class ChainRoller extends BasicRoller {
    result: string;
    showFormula: boolean = false;
    subRollers: BasicRoller[] = [];
    app: App;

    private _resultSeparator?: string;

    private async executeRoll() {
        let subResults = [];
        for (let i = 0; i < this.subRollers.length; ++i) {
            const subRoller = this.subRollers[i] as any;
            const subResult = await subRoller.rollSilent();
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

        const decodeEscapedControlChars = (s: string) => s
            .replace(/\\t/g, "\t")
            .replace(/\\r/g, "\r")
            .replace(/\\n/g, "\n");

        const escapeControlChars = (s: string) => s
            .replace(/\t/g, "\\t")
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n");

        const rawSeparator = this._resultSeparator ?? RESULT_SEPARATOR;
        const decodedSeparator = decodeEscapedControlChars(rawSeparator);
        const displayJoiner = decodedSeparator.endsWith("\n") ? decodedSeparator.trimEnd() : decodedSeparator;

        const allowLineBreaks = (this.data && (this.data as any).allowChainedSeparatorLineBreaks) ?? false;

        let inlineJoiner: string;
        if (allowLineBreaks) {
            inlineJoiner = displayJoiner;
        } else {
            const shouldEscapeControlChars = rawSeparator.includes("\t") || rawSeparator.includes("\r") || rawSeparator.includes("\n");
            inlineJoiner = shouldEscapeControlChars ? escapeControlChars(rawSeparator) : rawSeparator;
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
        position = data.position,
        resultSeparator?: string,
        alias?: string | null,
        showFormula?: boolean,
        displayFormulaAfter?: boolean,
    ) {
        super(data, original, [] as any, position, alias);
        this.subRollers = subRollers;
        this.app = app;
        this._resultSeparator = resultSeparator;
        
        if (typeof showFormula === "boolean") {
            this.showFormula = showFormula;
        }

        if (displayFormulaAfter) {
            const label = this.data?.enableRollAliasing && this.alias
                ? this.alias
                : this.original;
            this.containerEl.createSpan({
                cls: "dice-roller-formula",
                text: `(${label})`
            });
        }
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

        let textToShow = displayText ?? "";
        if (this.showFormula) {
            const inline = this.data?.enableRollAliasing && this.alias && !this.data.displayResultsInline
                ? `${this.alias} `
                : `${this.inlineText}`;
            textToShow = `${inline}${textToShow}`;
        }

        this.resultEl.setText(textToShow);
        if (displayText && displayText.includes("\n")) {
            (this.resultEl.style as any).whiteSpace = "pre-wrap";
        }
    }

    async getReplacer() {
        let inline = "";
        if (this.showFormula) {
            inline = this.data?.enableRollAliasing && this.alias && !this.data.displayResultsInline
                ? `${this.alias} `
                : `${this.inlineText} `;
        }
        const inlineText = (this as any)._chainedInlineResult ?? this.result ?? "";

        // Ensure accidental real newlines are represented as literal escapes in
        // inline replacers unless the user explicitly allows line breaks.
        const allowLineBreaks = (this.data && (this.data as any).allowChainedSeparatorLineBreaks) ?? false;
        const normalized = allowLineBreaks ? inlineText : inlineText.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
        return `${inline}${normalized}`;
    }

    getTooltip() {
        const inner = this.subRollers.map((s) => s.getTooltip?.() ?? "").join("\n\n");
        const formulaLabel = this.data?.enableRollAliasing && this.alias
            ? this.alias
            : this.original;
        return `${formulaLabel}\n\n${inner}`;
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
            original: this.data?.enableRollAliasing && this.alias ? this.alias : (this as any).original
        };

        if (this.data?.enableRollAliasing && this.alias && (this.data as any).enableAutoSaveAliasedRolls) {
            try {
                this.data.formulas = this.data.formulas ?? {};
                this.data.formulas[this.alias] = this.original;
                const plugin = (this.app as any)?.plugins?.getPlugin?.("obsidian-dice-roller");
                if (plugin && typeof plugin.saveSettings === "function") {
                    await plugin.saveSettings();
                }
            } catch (e) {
                console.error("Failed to auto-save aliased roll (chain)", e);
            }
        }

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
