import { ArrayRoller, type BasicRoller } from "../rollers/roller";
import {
    ButtonPosition,
    type DiceRollerSettings
} from "../settings/settings.types";
import { ExpectedValue, Round } from "../types/api";

import { decode } from "he";
import {
    LEXEME_TYPE_CHAINED_ROLL,
    LEXEME_TYPE_DATAVIEW,
    LEXEME_TYPE_DICE,
    LEXEME_TYPE_LINE,
    LEXEME_TYPE_LINK,
    LEXEME_TYPE_NARRATIVE,
    LEXEME_TYPE_RESULT_SEPARATOR,
    LEXEME_TYPE_SECTION,
    LEXEME_TYPE_TABLE,
    LEXEME_TYPE_TAG,
    Lexer,
    type LexicalToken
} from "../lexer/lexer";
import type { App } from "obsidian";

import { DataviewManager } from "./api.dataview";
import { ChainRoller } from "src/rollers/chain/chain";
import { NarrativeStackRoller } from "src/rollers/dice/narrative";
import { StackRoller } from "src/rollers/dice/stack";
import { LineRoller } from "src/rollers/line/line";
import { SectionRoller } from "src/rollers/section/section";
import { DataViewRoller, TagRoller } from "src/rollers/tag/tag";
import { TableRoller } from "src/rollers/table/table";
import { CHAINED_ROLL_DELIMITER } from "src/utils/constants";

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

const PARAM_AVG = "|avg";
const PARAM_CEIL = "|ceil";
const PARAM_FLOOR = "|floor";
const PARAM_FORM = "|form";
const PARAM_NODICE = "|nodice";
const PARAM_NOFORM = "|noform";
const PARAM_NONE = "|none";
const PARAM_NOPAREN = "|noparen";
const PARAM_NORENDER = "|norender";
const PARAM_NOROUND = "|noround";
const PARAM_LOOKUP = "|lookup=";
const PARAM_PAREN = "|paren";
const PARAM_RENDER = "|render";
const PARAM_ROUND = "|round";
const PARAM_SIGNED = "|signed";
const PARAM_TEXT = "|text(";

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

export interface APIInterface {
    app: App;
    data: DiceRollerSettings;
    sources: Map<string, RollerOptions>;

    getArrayRoller(options: any[], rolls?: number): Promise<ArrayRoller>;
    getParametersForRoller(content: string, options: RollerOptions ): { content: string } & RollerOptions;
    getRoller(raw: string, source?: string, options?: RollerOptions ): BasicRoller | null;
    getRollerOptions(data: DiceRollerSettings): RollerOptions;
    getRollerString(roll: string, source?: string): string;
    initialize(data: DiceRollerSettings, app: App): any;
    parseDice(content: string, source?: string): Promise<{ result: string, roller: BasicRoller }>;
    registerSource(source: string, options: RollerOptions): void;
}

class APIInstance implements APIInterface {
    app: App;
    data: DiceRollerSettings;

    initialize(data: DiceRollerSettings, app: App) {
        this.data = data;
        this.app = app;
        Lexer.setEnableChainRoller(this.data?.enableChainRoller);
    }

    #getTypeFromLexemes(lexemes: LexicalToken[]) {
        if (lexemes.some(({ type }) => type === LEXEME_TYPE_TABLE)) {
            return LEXEME_TYPE_TABLE;
        }
        if (lexemes.some(({ type }) => type === LEXEME_TYPE_SECTION)) {
            return LEXEME_TYPE_SECTION;
        }
        if (lexemes.some(({ type }) => type === LEXEME_TYPE_DATAVIEW)) {
            return LEXEME_TYPE_DATAVIEW;
        }
        if (lexemes.some(({ type }) => type === LEXEME_TYPE_TAG)) {
            return LEXEME_TYPE_TAG;
        }
        if (lexemes.some(({ type }) => type === LEXEME_TYPE_LINK)) {
            return LEXEME_TYPE_LINK;
        }
        if (lexemes.some(({ type }) => type === LEXEME_TYPE_LINE)) {
            return LEXEME_TYPE_LINE;
        }
        if (lexemes.some(({ type }) => type === LEXEME_TYPE_NARRATIVE)) {
            return LEXEME_TYPE_NARRATIVE;
        }
        return LEXEME_TYPE_DICE;
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
        if (content.includes(PARAM_NODICE)) {
            position = ButtonPosition.NONE;
        }
        if (content.includes(PARAM_RENDER)) {
            shouldRender = true;
        }
        if (content.includes(PARAM_NORENDER)) {
            shouldRender = false;
        }
        if (content.includes(PARAM_FORM)) {
            showFormula = true;
        }
        if (content.includes(PARAM_NOFORM)) {
            showFormula = false;
        }
        if (content.includes(PARAM_AVG)) {
            expectedValue = ExpectedValue.Average;
        }
        if (content.includes(PARAM_NONE)) {
            expectedValue = ExpectedValue.None;
        }
        if (content.includes(PARAM_TEXT)) {
            let [, matched] = content.match(regextext) ?? [null, ""];
            text = matched;
        }
        if (content.includes(PARAM_PAREN)) {
            showParens = true;
        }
        if (content.includes(PARAM_NOPAREN)) {
            showParens = false;
        }

        if (content.includes(PARAM_ROUND)) {
            round = Round.Normal;
        }
        if (content.includes(PARAM_NOROUND)) {
            round = Round.None;
        }
        if (content.includes(PARAM_CEIL)) {
            round = Round.Up;
        }
        if (content.includes(PARAM_FLOOR)) {
            round = Round.Down;
        }
        if (content.includes(PARAM_SIGNED)) {
            signed = true;
        }
        if (content.includes(PARAM_LOOKUP)) {
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

    #getChainRoller(raw: string, source: string, options: RollerOptions) {
        if (!this.data.enableChainRoller) {
            console.error("Chain roller is not enabled.");
            return null;
        }
        const topLevelLexemeResult = Lexer.parse(raw);
        if (topLevelLexemeResult.isErr()) {
            console.error(topLevelLexemeResult.unwrapErr());
            return null;
        }
        const topLevelLexemes = topLevelLexemeResult.unwrap();

        let resultSeparator: string | undefined = undefined;
        const finalTopLevelLexeme = topLevelLexemes[topLevelLexemes.length - 1];
        if (finalTopLevelLexeme.type === LEXEME_TYPE_RESULT_SEPARATOR) {
            resultSeparator = finalTopLevelLexeme.value;
            topLevelLexemes.pop();
        }

        const createSubRoller = (lexeme: LexicalToken) => {
            if (lexeme.type !== LEXEME_TYPE_CHAINED_ROLL) {
                console.error(
                    "Unexpected lexeme type in chain roller input: ",
                    lexeme
                );
                return null;
            }
            if (lexeme.value.includes(CHAINED_ROLL_DELIMITER)) {
                console.error(
                    "Nested chained rolls are not supported. Invalid lexeme: ",
                    lexeme
                );
                return null;
            }
            return this.getRoller(lexeme.value, source, options);
        }

        let subRollers: BasicRoller[] = [];
        for (let lexeme of topLevelLexemes) {
            const roller = createSubRoller(lexeme);
            if (!roller) {
                return null;
            }
            subRollers.push(roller);
        }

        return new ChainRoller(this.data, raw, subRollers, this.app, options.position, resultSeparator);
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

        if (this.data.enableChainRoller && content.includes(CHAINED_ROLL_DELIMITER)) {
            return this.#getChainRoller(raw, source, options);
        }

        const lexemeResult = Lexer.parse(content);
        if (lexemeResult.isErr()) {
            console.error(lexemeResult.unwrapErr());
            return null;
        }
        const lexemes = lexemeResult.unwrap();

        const type = this.#getTypeFromLexemes(lexemes);
        switch (type) {
            case LEXEME_TYPE_NARRATIVE: {
                return new NarrativeStackRoller(
                        this.data,
                        content,
                        lexemes,
                        this.app,
                        position
                    );
            }
            case LEXEME_TYPE_DICE: {
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
            case LEXEME_TYPE_TABLE: {
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
            case LEXEME_TYPE_SECTION: {
                return new SectionRoller(
                    this.data,
                    content,
                    lexemes[0],
                    source,
                    this.app,
                    position
                );
            }
            case LEXEME_TYPE_DATAVIEW: {
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
            case LEXEME_TYPE_TAG: {
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
            case LEXEME_TYPE_LINE: {
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
            roll += options.position !== ButtonPosition.NONE ? "" : PARAM_NODICE;
        }
        if ("shouldRender" in options) {
            roll += options.shouldRender ? PARAM_RENDER : PARAM_NORENDER;
        }
        if ("showFormula" in options) {
            roll += options.showFormula ? PARAM_FORM : PARAM_NOFORM;
        }
        if ("expectedValue" in options) {
            if (options.expectedValue == ExpectedValue.Average) {
                roll += PARAM_AVG;
            }
            if (options.expectedValue == ExpectedValue.None) {
                roll += PARAM_NONE;
            }
        }
        if ("text" in options && options.text) {
            roll += PARAM_TEXT + options.text + ")";
        }
        if ("showParens" in options) {
            roll += options.showParens ? PARAM_PAREN : PARAM_NOPAREN;
        }
        if ("round" in options) {
            switch (options.round) {
                case Round.Down: {
                    roll += PARAM_FLOOR;
                    break;
                }
                case Round.Up: {
                    roll += PARAM_CEIL;
                    break;
                }
                case Round.Normal: {
                    roll += PARAM_ROUND;
                    break;
                }
                case Round.None: {
                    roll += PARAM_NOROUND;
                }
            }
        }
        if (options.signed) {
            roll += PARAM_SIGNED;
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
