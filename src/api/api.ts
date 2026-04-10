import { ArrayRoller, MultiRoller, type BasicRoller } from "../rollers/roller";
import { ButtonPosition, type DiceRollerSettings } from "../settings/settings.types";
import { ExpectedValue, Round } from "../types/api";
import { MULTI_ROLL_DELIMITER } from "src/utils/constants";

import { decode } from "he";
import { Lexer, type LexicalToken } from "../lexer/lexer";
import { Notice, type App } from "obsidian";

import { DataviewManager } from "./api.dataview";
import { StackRoller } from "src/rollers/dice/stack";
import { TableRoller } from "src/rollers/table/table";
import { SectionRoller } from "src/rollers/section/section";
import { DataViewRoller, TagRoller } from "src/rollers/tag/tag";
import { LineRoller } from "src/rollers/line/line";
import { NarrativeStackRoller } from "src/rollers/dice/narrative";

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
            content,
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

        const parseMultiRollSegment = (raw: string) => {
            let bracketStack: string[] = [];
            let inSingleQuote = false;
            let inDoubleQuote = false;
            let buffer = "";
            let remainder = "";

            for (let i = 0; i < raw.length; i++) {
                const ch = raw[i];
                if (ch === "'" && !inDoubleQuote) {
                    inSingleQuote = !inSingleQuote;
                }
                else if (ch === '"' && !inSingleQuote) {
                    inDoubleQuote = !inDoubleQuote;
                }
                else if (!inSingleQuote && !inDoubleQuote) {
                    if (ch === "(" || ch === "[" || ch === "{") {
                        bracketStack.push(ch);
                    } else if ((ch === ")" || ch === "]" || ch === "}") && bracketStack.length > 0) {
                        const lastBracket = bracketStack[bracketStack.length - 1];
                        if (lastBracket === "(" && ch === ")"
                            || lastBracket === "[" && ch === "]"
                            || lastBracket === "{" && ch === "}") {
                                bracketStack.pop();
                        }
                    } else if (ch === MULTI_ROLL_DELIMITER && bracketStack.length === 0) {
                        remainder = raw.slice(i + 1);
                        break;
                    }
                }
                buffer += ch;
            }

            buffer = buffer.trim();
            let roller = this.getRoller(buffer, source, options);
            return {
                roller,
                roll: buffer,
                remainder
            }
        }

        const splitMultiRollFormula = (raw: string) => {
            const rollers: BasicRoller[] = [];
            let buffer = raw;
            for (; buffer.length > 0;) {
                const segment = parseMultiRollSegment(buffer);
                if (!segment.roller) {
                    new Notice(`${segment.roll} is not a valid dice roll.`)
                    return null;
                }
                rollers.push(segment.roller);
                buffer = segment.remainder;
            }
            return rollers;
        };

        // If multiple independent rolls are provided separated by top-level delimiters,
        // evaluate them independently and display results sequentially.
        if (content.includes(MULTI_ROLL_DELIMITER) && splitMultiRollFormula(content).length > 1) {
            const rollers = splitMultiRollFormula(content);
            console.log(rollers);
            return new MultiRoller(this.data, content, rollers, position);
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
                return new NarrativeStackRoller(
                        this.data,
                        content,
                        lexemes,
                        this.app,
                        position
                    );
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
                return roller;
            }
            case "section": {
                return new SectionRoller(
                    this.data,
                    content,
                    lexemes[0],
                    source,
                    this.app,
                    position
                );
            }
            case "dataview": {
                if (!DataviewManager.canUseDataview) {
                    throw new Error(
                        "Tags are only supported with the Dataview plugin installed."
                    );
                }
                return new DataViewRoller(
                    this.data,
                    content,
                    lexemes[0],
                    source,
                    this.app,
                    position
                );
            }
            case "tag": {
                if (!DataviewManager.canUseDataview) {
                    throw new Error(
                        "Tags are only supported with the Dataview plugin installed."
                    );
                }
                return new TagRoller(
                    this.data,
                    content,
                    lexemes[0],
                    source,
                    this.app,
                    position
                );
            }
            case "line": {
                return new LineRoller(
                    this.data,
                    content,
                    lexemes[0],
                    source,
                    this.app,
                    position
                );
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
