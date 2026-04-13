import { ArrayRoller, type BasicRoller } from "../rollers/roller";
import {
    ButtonPosition,
    type DiceRollerSettings
} from "../settings/settings.types";
import { ExpectedValue, Round } from "../types/api";

import { decode } from "he";
import { Lexer, type LexicalToken } from "../lexer/lexer";
import type { App } from "obsidian";

import { DataviewManager } from "./api.dataview";
import { ChainRoller } from "src/rollers/chain/chain";
import { NarrativeStackRoller } from "src/rollers/dice/narrative";
import { StackRoller } from "src/rollers/dice/stack";
import { LineRoller } from "src/rollers/line/line";
import { SectionRoller } from "src/rollers/section/section";
import { DataViewRoller, TagRoller } from "src/rollers/tag/tag";
import { TableRoller } from "src/rollers/table/table";
import {
    CHAINED_ROLL_ALIAS_REGEX,
    CHAINED_ROLL_DELIMITER,
    RESULT_SEPARATOR_OVERRIDE_INDICATOR,
    RESULT_SEPARATOR_OVERRIDE_REGEX,
    ROLL_ALIAS_INDICATOR,
    ROLL_ALIAS_REGEX
} from "src/utils/constants";

export * from "../types/api";

export {
    type StackRoller,
    type TableRoller,
    type SectionRoller,
    type DataViewRoller,
    type TagRoller,
    type LineRoller,
    type ArrayRoller,
    type NarrativeStackRoller
};

export interface RollerOptions {
    position?: ButtonPosition;
    shouldRender?: boolean;
    showFormula?: boolean;
    expectedValue?: ExpectedValue;
    round?: Round;
    text?: string;
    showParens?: boolean;
    formulaAfter?: boolean;
    signed?: boolean;
    lookup?: string;
}

declare global {
    interface Window {
        DiceRoller: APIInstance;
    }
}

declare module "obsidian" {
    interface Workspace {
        on(
            name: "dice-roller:render-dice",
            callback: (roll: string) => void
        ): EventRef;
        on(
            name: "dice-roller:rendered-result",
            callback: (result: number) => void
        ): EventRef;
        on(
            name: "dice-roller:settings-change",
            callback: (data: DiceRollerSettings) => void
        ): EventRef;
        on(
            name: "dice-roller:new-result",
            callback: (data: StackRoller) => void
        ): EventRef;

        on(name: "dice-roller:loaded", callback: () => void): EventRef;
        on(name: "dice-roller:unloaded", callback: () => void): EventRef;
    }
}

class APIInstance {
    app: App;
    data: DiceRollerSettings;

    initialize(data: DiceRollerSettings, app: App) {
        this.data = data;
        this.app = app;
    }

    #getTypeFromLexemes(lexemes: LexicalToken[]) {
        if (lexemes.some(({ type }) => type === "table")) {
            return "table";
        }
        if (lexemes.some(({ type }) => type === "section")) {
            return "section";
        }
        if (lexemes.some(({ type }) => type === "dataview")) {
            return "dataview";
        }
        if (lexemes.some(({ type }) => type === "tag")) {
            return "tag";
        }
        if (lexemes.some(({ type }) => type === "link")) {
            return "link";
        }
        if (lexemes.some(({ type }) => type === "line")) {
            return "line";
        }
        if (lexemes.some(({ type }) => type === "narrative")) {
            return "narrative";
        }
        return "dice";
    }
    getParametersForRoller(
        content: string,
        options: RollerOptions
    ): { content: string } & RollerOptions {
        content = content.replace(/\\\|/g, "|");

        let position = options?.position ?? ButtonPosition.LEFT;
        let shouldRender = options?.shouldRender ?? this.data.renderAllDice;
        let showFormula =
            options?.showFormula ?? this.data.displayResultsInline;
        let showParens = options?.showParens ?? this.data.displayFormulaAfter;
        let expectedValue: ExpectedValue =
            options?.expectedValue ?? this.data.initialDisplay;
        let text: string = options?.text ?? "";
        let round = options?.round ?? this.data.round;
        let signed = options?.signed ?? this.data.signed;
        let lookup = options?.lookup;

        const regextext = /\|text\((.*)\)/;

        //Flags always take precedence.
        if (content.includes("|nodice")) {
            position = ButtonPosition.NONE;
        }
        if (content.includes("|render")) {
            shouldRender = true;
        }
        if (content.includes("|norender")) {
            shouldRender = false;
        }
        if (content.includes("|form")) {
            showFormula = true;
        }
        if (content.includes("|noform")) {
            showFormula = false;
        }
        if (content.includes("|avg")) {
            expectedValue = ExpectedValue.Average;
        }
        if (content.includes("|none")) {
            expectedValue = ExpectedValue.None;
        }
        if (content.includes("|text(")) {
            let [, matched] = content.match(regextext) ?? [null, ""];
            text = matched;
        }
        if (content.includes("|paren")) {
            showParens = true;
        }
        if (content.includes("|noparen")) {
            showParens = false;
        }

        if (content.includes("|round")) {
            round = Round.Normal;
        }
        if (content.includes("|noround")) {
            round = Round.None;
        }
        if (content.includes("|ceil")) {
            round = Round.Up;
        }
        if (content.includes("|floor")) {
            round = Round.Down;
        }
        if (content.includes("|signed")) {
            signed = true;
        }
        if (content.includes("|lookup=")) {
            [, lookup] = content.match(/\|lookup=(.+?)(?:\||$)/) ?? [];
        }

        content = decode(
            //remove flags...
            content
                .replace(
                    /\|(no)?(dice|render|form|paren|avg|none|round|floor|ceil|signed)/g,
                    ""
                )
                .replace(/\|lookup=.+?(\||$)/, "")
                .replace(regextext, "")
        );

        if (content in this.data.formulas) {
            content = this.data.formulas[content];
        }

        return {
            content,
            position,
            showParens,
            showFormula,
            expectedValue,
            shouldRender,
            text,
            round,
            signed,
            lookup
        };
    }

    sources: Map<string, RollerOptions> = new Map();

    registerSource(source: string, options: RollerOptions): void {
        this.sources.set(source, options);
    }

    getRoller(
        raw: string,
        source: string = "",
        options: RollerOptions = this.getRollerOptions(this.data)
    ): BasicRoller | null {
        const {
            content: rawContent,
            position,
            showParens,
            showFormula,
            expectedValue,
            round,
            shouldRender,
            text,
            signed,
            lookup
        } = this.getParametersForRoller(raw, options);

        let content = rawContent;
        let rollAlias: string | undefined;

        let matchRegexPreservingQuotes = (content: string, matcher: RegExp) => {
            const m = content.match(matcher);
            if (m) {
                return {
                    result: m[1]
                        .replace(/\\\"/g, "{ESCAPED_QUOTE}")
                        .replace(/\"/g, "")
                        .replace(/{ESCAPED_QUOTE}/g, "\""),
                    remainder: content.slice(0, content.length - m[0].length)
                };
            }
            return null;
        }

        if (this.data.enableChainRoller && content.includes(CHAINED_ROLL_DELIMITER)) {
            let segments = content.split(CHAINED_ROLL_DELIMITER)
                .map(s => s.trim())
                .filter(s => s !== "");

            if (this.data.enableRollAliasing && segments.last().includes(ROLL_ALIAS_INDICATOR)) {
                let m = matchRegexPreservingQuotes(segments.last(), ROLL_ALIAS_REGEX);
                if (m) {
                    rollAlias = m.result.trim();
                    segments[segments.length - 1] = m.remainder;
                }
            }

            let overrideSeparator: string | undefined;
            if (segments.last().includes(RESULT_SEPARATOR_OVERRIDE_INDICATOR)) {
                let m = matchRegexPreservingQuotes(segments.last(), RESULT_SEPARATOR_OVERRIDE_REGEX);
                if (m) {
                    overrideSeparator = m.result;
                    segments.splice(segments.length - 1, 1);
                }
            }

            const rollers: BasicRoller[] = [];
            for (let i = 0; i < segments.length; ++i) {
                let segment = segments[i];
                if (segment === "") {
                    continue;
                }
                let roller = this.getRoller(segment, source);
                if (!roller) {
                    console.error(`\`${segment}\` is not a valid dice roll.`);
                    return null;
                }
                rollers.push(roller);
            }

            const chainData = overrideSeparator
                ? Object.assign({}, this.data, { chainedResultSeparator: overrideSeparator })
                : this.data;

            let roller = new ChainRoller(chainData, content, rollers, this.app, position);
            if (rollAlias) {
                roller.setRollAlias(rollAlias);
            }
            return roller;
        }
        
        if (this.data.enableRollAliasing && content.includes(ROLL_ALIAS_INDICATOR)) {
            let m = matchRegexPreservingQuotes(content, ROLL_ALIAS_REGEX);
            if (m) {
                rollAlias = m.result.trim();
                content = m.remainder;
            }
        }

        const lexemeResult = Lexer.parse(content);

        if (lexemeResult.isErr()) {
            console.error(lexemeResult.unwrapErr());
            return null;
        }
        const lexemes = lexemeResult.unwrap();

        const type = this.#getTypeFromLexemes(lexemes);
        switch (type) {
            case "narrative": {
                const roller = new NarrativeStackRoller(
                        this.data,
                        content,
                        lexemes,
                        this.app,
                        position
                    );
                if (rollAlias) {
                    roller.setRollAlias(rollAlias);
                }
                return roller;
            }
            case "dice": {
                const roller = new StackRoller(
                    this.data,
                    content,
                    lexemes,
                    this.app,
                    position,
                    text,
                    expectedValue,
                    showParens,
                    round,
                    signed
                );
                roller.showFormula = showFormula;
                roller.shouldRender = shouldRender;
                roller.showRenderNotice = this.data.showRenderNotice;
                roller.setSource(source);
                if (rollAlias) {
                    roller.setRollAlias(rollAlias);
                }
                return roller;
            }
            case "table": {
                const roller = new TableRoller(
                    this.data,
                    content,
                    lexemes[0],
                    source,
                    this.app,
                    position,
                    lookup
                );
                if (rollAlias) {
                    roller.setRollAlias(rollAlias);
                }
                return roller;
            }
            case "section": {
                const roller = new SectionRoller(
                    this.data,
                    content,
                    lexemes[0],
                    source,
                    this.app,
                    position
                );
                if (rollAlias) {
                    roller.setRollAlias(rollAlias);
                }
                return roller;
            }
            case "dataview": {
                if (!DataviewManager.canUseDataview) {
                    throw new Error(
                        "Tags are only supported with the Dataview plugin installed."
                    );
                }
                const roller = new DataViewRoller(
                    this.data,
                    content,
                    lexemes[0],
                    source,
                    this.app,
                    position
                );
                if (rollAlias) {
                    roller.setRollAlias(rollAlias);
                }
                return roller;
            }
            case "tag": {
                if (!DataviewManager.canUseDataview) {
                    throw new Error(
                        "Tags are only supported with the Dataview plugin installed."
                    );
                }
                const roller = new TagRoller(
                    this.data,
                    content,
                    lexemes[0],
                    source,
                    this.app,
                    position
                );
                if (rollAlias) {
                    roller.setRollAlias(rollAlias);
                }
                return roller;
            }
            case "line": {
                const roller = new LineRoller(
                    this.data,
                    content,
                    lexemes[0],
                    source,
                    this.app,
                    position
                );
                if (rollAlias) {
                    roller.setRollAlias(rollAlias);
                }
                return roller;
            }
        }
    }

    getRollerString(roll: string, source?: string): string {
        if (!source) return roll;
        const options =
            this.sources.get(source) ?? this.getRollerOptions(this.data);
        if ("position" in options) {
            roll += options.position !== ButtonPosition.NONE ? "" : "|nodice";
        }
        if ("shouldRender" in options) {
            roll += options.shouldRender ? "|render" : "|norender";
        }
        if ("showFormula" in options) {
            roll += options.showFormula ? "|form" : "|noform";
        }
        if ("expectedValue" in options) {
            if (options.expectedValue == ExpectedValue.Average) {
                roll += "|avg";
            }
            if (options.expectedValue == ExpectedValue.None) {
                roll += "|none";
            }
        }
        if ("text" in options && options.text) {
            roll += "|text(" + options.text + ")";
        }
        if ("showParens" in options) {
            roll += options.showParens ? "|paren" : "|noparen";
        }
        if ("round" in options) {
            switch (options.round) {
                case Round.Down: {
                    roll += "|floor";
                    break;
                }
                case Round.Up: {
                    roll += "|ceil";
                    break;
                }
                case Round.Normal: {
                    roll += "|round";
                    break;
                }
                case Round.None: {
                    roll += "|noround";
                }
            }
        }
        if (options.signed) {
            roll += "|signed";
        }
        return roll;
    }
    async getArrayRoller(options: any[], rolls = 1) {
        const roller = new ArrayRoller(this.data, options, rolls);

        await roller.roll();
        return roller;
    }
    public async parseDice(content: string, source: string = "") {
        const roller = await this.getRoller(content, source);
        return { result: await roller?.roll(), roller };
    }
    getRollerOptions(data: DiceRollerSettings): RollerOptions {
        return {
            position: data.position,
            shouldRender: data.renderAllDice,
            showFormula: data.displayResultsInline,
            showParens: data.displayFormulaAfter,
            expectedValue: data.initialDisplay,
            round: data.round,
            text: null,
            signed: data.signed
        };
    }
}

export const API = new APIInstance();
