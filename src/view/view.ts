import {
    ButtonComponent,
    ExtraButtonComponent,
    ItemView,
    Notice,
    Platform,
    TextAreaComponent,
    WorkspaceLeaf
} from "obsidian";
import type DiceRollerPlugin from "src/main";
import { StackRoller } from "src/rollers/dice/stack";
import { ChainRoller } from "src/rollers/roller";
import { ExpectedValue } from "../types/api";
import { API } from "../api/api";
import { type DiceIcon, IconManager } from "./view.icons";
import {
    CHAIN_ROLL_DELIMITER,
    DICE_TRAY_NO_DICE_MSG,
    DICE_TRAY_NOT_SUPPORTED_MSG
} from "src/utils/constants";
import { Icons } from "src/utils/icons";
import { nanoid } from "nanoid";
import DiceTray from "./ui/DiceTray.svelte";
import type { RenderableRoller } from "src/rollers/roller";

export const VIEW_TYPE = "DICE_ROLLER_VIEW";

export interface ViewResult {
    original: string;
    resultText: string;
    result: string | number;
    timestamp: number;
    id: string;
}

export default class DiceView extends ItemView {
    activeSegmentIndex: number | null = null;
    addRollButton: ExtraButtonComponent;
    advantageButton: ButtonComponent;
    clearFormulaButton: ExtraButtonComponent;
    custom = "";
    disadvantageButton: ButtonComponent;
    gridEl: HTMLDivElement;
    noResultsEl: HTMLSpanElement;
    focusNextRollButton: ExtraButtonComponent;
    focusPreviousRollButton: ExtraButtonComponent;
    formulaComponent: TextAreaComponent;
    formulaEl: HTMLDivElement;
    removeRollButton: ExtraButtonComponent;
    resultEl: HTMLDivElement;
    rollButton: ButtonComponent;
    saveButton: ExtraButtonComponent;
    stack: StackRoller;
    #icons = IconManager;

    formulaSegmentStates: Array<{
        diceRollFormula: Map<DiceIcon, number>;
        modifier: number;
        hasAdvantage: boolean;
        hasDisadvantage: boolean;
    }> = [
        { diceRollFormula: new Map(), modifier: 0, hasAdvantage: false, hasDisadvantage: false }
    ];

    Formatter = new Intl.DateTimeFormat(
        localStorage.getItem("language") ?? "en-US",
        {
            dateStyle: "medium",
            timeStyle: "short"
        }
    );

    private async addResult(result: ViewResult, save = true) {
        if (this.noResultsEl) {
            this.noResultsEl.detach();
        }
        const resultEl = createDiv("view-result");
        const topPaneEl = resultEl.createDiv("result-actions");
        const reroll = new ExtraButtonComponent(topPaneEl)
            .setIcon(Icons.DICE)
            .setTooltip("Roll Again")
            .onClick(() => this.roll(result.original));
        reroll.extraSettingsEl.addClass("dice-result-reroll");
        topPaneEl.createSpan({
            text: result.original
        });

        const copy = new ExtraButtonComponent(topPaneEl)
            .setIcon(Icons.COPY)
            .setTooltip("Copy Result")
            .onClick(async () => {
                await navigator.clipboard.writeText(`${result.resultText}`);
            });
        copy.extraSettingsEl.addClass("dice-content-copy");
        if (Platform.isMobile) {
            resultEl.createSpan({
                cls: "dice-content-result",
                text: `${result.resultText}`
            });
        }
        resultEl.createEl("strong", {
            attr: {
                "aria-label": result.resultText
            },
            text: `${result.result}`
        });

        const context = resultEl.createDiv("result-context");

        context.createEl("em", {
            cls: "result-timestamp",
            text: this.Formatter.format(result.timestamp)
        });
        new ExtraButtonComponent(context)
            .setIcon(Icons.DELETE)
            .onClick(async () => {
                resultEl.detach();
                if (this.resultEl.children.length === 0) {
                    this.resultEl.prepend(this.noResultsEl);
                }

                this.plugin.data.viewResults.splice(
                    this.plugin.data.viewResults.findIndex(
                        (r) => r.id === result.id
                    ),
                    1
                );
                await this.plugin.saveSettings();
            });

        this.resultEl.prepend(resultEl);
        if (save) {
            this.plugin.data.viewResults.push(result);
            this.plugin.data.viewResults = this.plugin.data.viewResults.slice(
                0,
                100
            );
            await this.plugin.saveSettings();
        }
    }

    private selectNextFormulaSegment() {
        if (this.formulaSegmentStates.length < 2) return;
        const data = this.getFormulaSegments();
        if (!data.ta) return;

        const { ta, segments, startIndexes } = data;

        this.updateActiveSegmentFromTextarea();
        let index = this.activeSegmentIndex ?? segments.length - 1;
        if (index < 0) index = 0;
        if (index >= segments.length - 1) return;

        const next = index + 1;
        this.activeSegmentIndex = next;
        const caret = startIndexes[next] + segments[next].length;
        ta.focus();
        ta.selectionStart = ta.selectionEnd = caret;
        this.updateAdvDisButtonStates();
    }

    private selectPreviousFormulaSegment() {
        if (this.formulaSegmentStates.length < 2) return;
        const data = this.getFormulaSegments();
        if (!data.ta) return;

        const { ta, segments, startIndexes } = data;

        this.updateActiveSegmentFromTextarea();
        let index = this.activeSegmentIndex ?? segments.length - 1;
        if (index <= 0) return;

        const prev = index - 1;
        this.activeSegmentIndex = prev;
        const caret = startIndexes[prev] + segments[prev].length;
        ta.focus();
        ta.selectionStart = ta.selectionEnd = caret;
        this.updateAdvDisButtonStates();
    }

    private getActiveFormulaSegment() {
        const index = this.activeSegmentIndex ?? this.formulaSegmentStates.length - 1;
        if (index < 0) return this.formulaSegmentStates[0];
        if (index >= this.formulaSegmentStates.length) {
            // create missing states up to index
            while (this.formulaSegmentStates.length <= index) {
                this.formulaSegmentStates.push({ diceRollFormula: new Map(), modifier: 0, hasAdvantage: false, hasDisadvantage: false });
            }
        }
        return this.formulaSegmentStates[index];
    }

    private getFormulaSegments(): { ta: HTMLTextAreaElement | null; segments: string[]; startIndexes: number[] } {
        const ta = this.formulaComponent?.inputEl as HTMLTextAreaElement;
        if (!ta) return { ta: null, segments: [], startIndexes: [] };
        if (!ta.value.includes(CHAIN_ROLL_DELIMITER)) return { ta: null, segments: [], startIndexes: [] };

        const segments = ta.value.split(CHAIN_ROLL_DELIMITER).map((p) => p.trim());
        let position = 0;
        const startIndexes: number[] = [];
        for (let i = 0; i < segments.length; i++) {
            startIndexes.push(position);
            position = position + segments[i].length + (CHAIN_ROLL_DELIMITER + " ").length;
        }

        return { ta, segments, startIndexes };
    }

    private removeActiveFormulaSegment(): void {
        if (this.formulaSegmentStates.length <= 1) {
            this.clear();
            return;
        }

        let activeIndex = this.activeSegmentIndex;
        if (activeIndex == null || activeIndex < 0 || activeIndex >= this.formulaSegmentStates.length) {
            activeIndex = this.formulaSegmentStates.length - 1;
        }

        // remove the corresponding state
        this.formulaSegmentStates.splice(activeIndex, 1);

        // update the textarea if it contains multiple segments
        const data = this.getFormulaSegments();
        if (data.ta) {
            const { ta, segments } = data;
            segments.splice(activeIndex, 1);
            const joined = segments.filter((p) => p !== "").join(CHAIN_ROLL_DELIMITER + " ");
            ta.value = joined;
        }

        if (this.formulaSegmentStates.length === 0) {
            this.resetActiveSegment();
            return;
        }

        if (activeIndex >= this.formulaSegmentStates.length) {
            activeIndex = this.formulaSegmentStates.length - 1;
        }
        this.activeSegmentIndex = activeIndex;

        // regenerate the visible formula from the active state
        this.setFormula();
    }

    private onClick_AddRollButton() {
        const ta = this.formulaComponent?.inputEl as HTMLTextAreaElement;
        if (!ta) return;


        if (!ta.value.includes(CHAIN_ROLL_DELIMITER)) {
            ta.value = ta.value.trimEnd() + CHAIN_ROLL_DELIMITER + " ";
            this.formulaSegmentStates.push({ diceRollFormula: new Map(), modifier: 0, hasAdvantage: false, hasDisadvantage: false });
            this.activeSegmentIndex = this.formulaSegmentStates.length - 1;
            ta.focus();
            ta.selectionStart = ta.selectionEnd = ta.value.length;
            return;
        }

        const start = ta.selectionStart ?? ta.value.length;
        const end = ta.selectionEnd ?? start;
        const before = ta.value.slice(0, start);
        const after = ta.value.slice(end);
        const insert = `${CHAIN_ROLL_DELIMITER} `;
        const newValue = before + insert + after;
        ta.value = newValue;
        const position = before.length + insert.length;

        // compute active index as number of delimiters before caret
        const beforeSlice = newValue.slice(0, position);
        const count = (beforeSlice.match(new RegExp(CHAIN_ROLL_DELIMITER, "g")) || []).length;

        // ensure segment state exists at index 'count'
        if (this.formulaSegmentStates.length <= count) {
            while (this.formulaSegmentStates.length <= count) {
                this.formulaSegmentStates.push({ diceRollFormula: new Map(), modifier: 0, hasAdvantage: false, hasDisadvantage: false });
            }
        } else {
            this.formulaSegmentStates.splice(count, 0, { diceRollFormula: new Map(), modifier: 0, hasAdvantage: false, hasDisadvantage: false });
        }

        this.activeSegmentIndex = count;
        ta.focus();
        ta.selectionStart = ta.selectionEnd = position;
    }

    private resetActiveSegment() {
        this.formulaSegmentStates = [{ diceRollFormula: new Map(), modifier: 0, hasAdvantage: false, hasDisadvantage: false }];
        this.activeSegmentIndex = 0;
    }

    private updateActiveSegmentFromTextarea(): void {
        const ta = this.formulaComponent?.inputEl as HTMLTextAreaElement;
        if (!ta) {
            this.activeSegmentIndex = null;
            this.updateAdvDisButtonStates();
            return;
        }
        if (!ta.value.includes(CHAIN_ROLL_DELIMITER)) {
            this.activeSegmentIndex = 0;
            this.updateAdvDisButtonStates();
            return;
        }
        const selection = ta.selectionStart ?? ta.value.length;
        const parts = ta.value.split(CHAIN_ROLL_DELIMITER).map((p) => p.trim());
        let position = 0;
        let activeIndex = parts.length - 1;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const start = position;
            const end = position + part.length;
            if (selection >= start && selection <= end) {
                activeIndex = i;
                break;
            }
            position = end + (CHAIN_ROLL_DELIMITER + " ").length;
        }
        this.activeSegmentIndex = activeIndex;
        this.updateAdvDisButtonStates();
    }

    private updateAdvDisButtonStates() {
        const state = this.getActiveFormulaSegment();
        if (state.hasAdvantage) {
            this.advantageButton.setCta();
        } else {
            this.advantageButton.removeCta();
        }
        if (state.hasDisadvantage) {
            this.disadvantageButton.setCta();
        } else {
            this.disadvantageButton.removeCta();
        }
    }

    constructor(public plugin: DiceRollerPlugin, public leaf: WorkspaceLeaf) {
        super(leaf);
        this.contentEl.addClass("dice-roller-view");

        this.addChild(this.#icons);

        for (const icon of this.plugin.data.icons) {
            this.#icons.registerIcon(icon.id, icon.shape, icon.text);
        }

        this.registerEvent(
            this.plugin.app.workspace.on(
                "dice-roller:new-result",
                async (roller: RenderableRoller) => {
                    if (
                        this.plugin.data.addToView ||
                        roller.getSource() == VIEW_TYPE
                    ) {
                        await this.addResult({
                            result: roller.getResultText(),
                            original: roller.original,
                            resultText: roller.getTooltip(),
                            timestamp: new Date().valueOf(),
                            id: nanoid(12)
                        });
                    }
                }
            )
        );
    }

    buildButtons() {
        this.gridEl.empty();

        const diceButtons = this.gridEl.createDiv("dice-buttons");
        for (const icon of this.plugin.data.icons) {
            this.#icons.registerIcon(icon.id, icon.shape, icon.text);
            new ExtraButtonComponent(diceButtons.createDiv("dice-button"))
                .setIcon(icon.id)
                .extraSettingsEl.onClickEvent((evt) => {
                    if (evt.type === "auxclick") {
                        this.roll(icon.formula);
                        return;
                    }
                    const state = this.getActiveFormulaSegment();
                    if (!state.diceRollFormula.has(icon)) {
                        state.diceRollFormula.set(icon, 0);
                    }
                    let amount = state.diceRollFormula.get(icon) ?? 0;
                    amount += evt.getModifierState("Shift") ? -1 : 1;
                    state.diceRollFormula.set(icon, amount);
                    this.setFormula();
                });
        }

        const activeState = this.getActiveFormulaSegment();
        const rollModifiers = this.gridEl.createDiv("roll-modifiers");

        new ExtraButtonComponent(rollModifiers)
            .setIcon(Icons.MINUS)
                .onClick(() => {
                const state = this.getActiveFormulaSegment();
                state.modifier -= 1;
                this.setFormula();
            });

        const adv = new ButtonComponent(rollModifiers)
            .setButtonText("ADV")
            .onClick(() => {
                const state = this.getActiveFormulaSegment();
                state.hasAdvantage = !state.hasAdvantage;
                state.hasDisadvantage = false;
                if (state.hasAdvantage) {
                    adv.setCta();
                    dis.removeCta();
                } else {
                    adv.removeCta();
                }
                this.setFormula();
            });
        this.advantageButton = adv;
        if (activeState.hasAdvantage) {
            adv.setCta();
        }

        const dis = new ButtonComponent(rollModifiers)
            .setButtonText("DIS")
            .onClick(() => {
                const state = this.getActiveFormulaSegment();
                state.hasDisadvantage = !state.hasDisadvantage;
                state.hasAdvantage = false;
                if (state.hasDisadvantage) {
                    dis.setCta();
                    adv.removeCta();
                } else {
                    dis.removeCta();
                }
                this.setFormula();
            });
        this.disadvantageButton = dis;
        if (activeState.hasDisadvantage) {
            dis.setCta();
        }

        new ExtraButtonComponent(rollModifiers)
            .setIcon(Icons.PLUS)
            .onClick(() => {
                const state = this.getActiveFormulaSegment();
                state.modifier += 1;
                this.setFormula();
            });

        new DiceTray({
            target: this.gridEl,
            props: {
                settings: this.plugin.data,
                plugin: this.plugin,
                view: this
            }
        });
    }

    buildFormula() {
        this.formulaEl.empty();
        this.formulaComponent = new TextAreaComponent(this.formulaEl)
            .setPlaceholder("Dice Formula")
            .onChange((v) => {
                const st = this.getActiveFormulaSegment();
                st.diceRollFormula = new Map();
            });

        try {
            const ta = this.formulaComponent.inputEl as HTMLTextAreaElement;
            ta.addEventListener("click", () => this.updateActiveSegmentFromTextarea());
            ta.addEventListener("keyup", () => this.updateActiveSegmentFromTextarea());
            ta.addEventListener("select", () => this.updateActiveSegmentFromTextarea());
            ta.addEventListener("focus", () => this.updateActiveSegmentFromTextarea());
            ta.addEventListener("input", () => this.updateActiveSegmentFromTextarea());
        } catch (e) {
            console.error("DiceView: Failed to create text area input listener.")
        }

        const formulaButtons = this.formulaEl.createDiv("formula-buttons");

        this.addRollButton = new ExtraButtonComponent(formulaButtons)
            .setIcon(Icons.ADD)
            .setTooltip("Add Another Roll")
            .onClick(() => this.onClick_AddRollButton());
        this.addRollButton.extraSettingsEl.addClass("dice-roller-add");

        this.focusPreviousRollButton = new ExtraButtonComponent(formulaButtons)
            .setIcon(Icons.PREVIOUS)
            .setTooltip("Select Previous Roll")
            .onClick(() => this.selectPreviousFormulaSegment());
        this.focusPreviousRollButton.extraSettingsEl.addClass("dice-roller-focus-next");

        this.focusNextRollButton = new ExtraButtonComponent(formulaButtons)
            .setIcon(Icons.NEXT)
            .setTooltip("Select Next Roll")
            .onClick(() => this.selectNextFormulaSegment());
        this.focusNextRollButton.extraSettingsEl.addClass("dice-roller-focus-next");

        this.removeRollButton = new ExtraButtonComponent(formulaButtons)
            .setIcon(Icons.REMOVE)
            .setTooltip("Remove Selected Roll")
            .onClick(() => this.removeActiveFormulaSegment());
        this.removeRollButton.extraSettingsEl.addClass("dice-roller-remove");

        this.clearFormulaButton = new ExtraButtonComponent(formulaButtons)
            .setIcon(Icons.DELETE)
            .setTooltip("Clear Formula")
            .onClick(() => this.clear());
        this.clearFormulaButton.extraSettingsEl.addClass("dice-roller-clear");

        this.saveButton = new ExtraButtonComponent(formulaButtons)
            .setIcon(Icons.SAVE)
            .setTooltip("Save Formula")
            .onClick(() => this.save());
        this.saveButton.extraSettingsEl.addClass("dice-roller-save");

        this.rollButton = new ButtonComponent(formulaButtons)
            .setIcon(Icons.DICE)
            .setCta()
            .setTooltip("Roll")
            .onClick(() => this.roll());
        this.rollButton.buttonEl.addClass("dice-roller-roll");
    }

    clear() {
        const ta = this.formulaComponent.inputEl as HTMLTextAreaElement;
        ta.value = "";
        this.resetActiveSegment();
    }

    get customFormulas() {
        return this.plugin.data.customFormulas;
    }

    async display() {
        this.contentEl.empty();
        this.gridEl = this.contentEl.createDiv("dice-roller-grid");
        this.formulaEl = this.contentEl.createDiv("dice-roller-formula");

        const headerEl = this.contentEl.createDiv("results-header-container");
        headerEl.createEl("h3", { cls: "results-header", text: "Results" });
        new ExtraButtonComponent(headerEl.createDiv("clear-all"))
            .setIcon(Icons.DELETE)
            .setTooltip("Clear All")
            .onClick(async () => {
                this.resultEl.empty();
                this.resultEl.append(this.noResultsEl);
                this.plugin.data.viewResults = [];
                await this.plugin.saveSettings();
            });
        const resultsEl = this.contentEl.createDiv(
            "dice-roller-results-container"
        );
        this.resultEl = resultsEl.createDiv("dice-roller-results");
        this.noResultsEl = this.resultEl.createSpan({
            text: "No results yet! Roll some dice to get started :)"
        });

        for (const result of this.plugin.data.viewResults) {
            this.addResult(result, false);
        }

        this.buildButtons();
        this.buildFormula();
    }

    getDisplayText() {
        return "Dice Tray";
    }

    getIcon() {
        return Icons.DICE;
    }

    getViewType() {
        return VIEW_TYPE;
    }

    async onClose() {
        await super.onClose();
    }

    async onOpen() {
        //build ui

        this.display();
    }

    async roll(formula = this.formulaComponent.inputEl.value) {
        if (!formula) {
            return;
        }
        this.rollButton.setDisabled(true);
        const opts = {
            ...API.getRollerOptions(this.plugin.data)
        };
        if (opts.expectedValue == ExpectedValue.None) {
            opts.expectedValue = ExpectedValue.Roll;
        }
        try {
            const roller = await API.getRoller(formula, VIEW_TYPE, opts);
            if (roller == null) return;
            if (roller instanceof StackRoller) {
                roller.iconEl.detach();
                roller.containerEl.onclick = null;
                roller.buildDiceTree();
                if (!roller.children.length) {
                    throw new Error(DICE_TRAY_NO_DICE_MSG);
                }
                await roller.roll(this.plugin.data.renderer).catch((e) => {
                    throw e;
                });
            } else if (roller instanceof ChainRoller) {
                roller.iconEl?.detach();
                roller.containerEl.onclick = null;
                await roller.roll_OnlyStackRollers();
            } else {
                throw new Error(DICE_TRAY_NOT_SUPPORTED_MSG);
            }
        } catch (e: any) {
            new Notice("Invalid Formula: " + e.message);
        } finally {
            this.rollButton.setDisabled(false);
            this.buildButtons();
            this.resetActiveSegment();
            this.setFormula();
        }
    }

    save() {
        if (!this.formulaComponent.inputEl.value) return;
        this.plugin.data.customFormulas.push(
            this.formulaComponent.inputEl.value
        );
        this.buildButtons();
        this.plugin.saveSettings();
    }

    setFormula() {
        const state = this.getActiveFormulaSegment();
        if (!state.diceRollFormula.size && !state.modifier) {
            this.formulaComponent.inputEl.value = "";
            return;
        }
        const formula: { formula: string; max: number; sign: "+" | "-" }[] = [];
        for (const [icon, amount] of state.diceRollFormula) {
            if (!amount) continue;
            const sign = amount < 0 ? "-" : "+";
            const diceFormula = /^(?:1)?d(\d|%|F)+$/.test(icon.formula)
                ? `${Math.abs(amount)}${icon.formula.replace(/^1/, "")}`
                : `${Math.abs(amount)} * (${icon.formula})`;
            const roller = API.getRoller(icon.formula, VIEW_TYPE);
            if (roller == null) continue;
            if (!(roller instanceof StackRoller)) continue;
            roller.buildDiceTree();
            roller.calculate();
            formula.push({ formula: diceFormula, max: roller.max, sign });
        }
        formula.sort((a, b) => b.max - a.max);

        const str: string[] = [];
        for (let index = 0; index < formula.length; index++) {
            const instance = formula[index];
            if (index === 0 && instance.sign === "-") {
                instance.formula = `${instance.sign}${instance.formula}`;
            } else if (index > 0) {
                str.push(instance.sign);
            }
            let mod = "";
            if (index === 0) {
                if (state.hasAdvantage) {
                    mod = "kh";
                } else if (state.hasDisadvantage) {
                    mod = "kl";
                }
                instance.formula = instance.formula.replace(
                    /(d\d+)/,
                    `$1${mod}`
                );
            }
            str.push(`${instance.formula}`);
        }
        if (state.modifier !== 0) {
            if (str.length > 0) {
                str.push(state.modifier > 0 ? "+" : "-");
            }
            str.push(`${Math.abs(state.modifier)}`);
        }

        const ta = this.formulaComponent?.inputEl as HTMLTextAreaElement;
        const newSegment = str.join(" ");

        if (ta && ta.value.includes(CHAIN_ROLL_DELIMITER)) {
            const parts = ta.value.split(CHAIN_ROLL_DELIMITER).map((p) => p.trim());

            let activeIndex = this.activeSegmentIndex;
            if (activeIndex == null || activeIndex < 0 || activeIndex >= parts.length) {
                this.updateActiveSegmentFromTextarea();
                activeIndex = this.activeSegmentIndex ?? parts.length - 1;
            }

            if (activeIndex < 0) activeIndex = 0;
            if (activeIndex >= parts.length) activeIndex = parts.length - 1;

            parts[activeIndex] = newSegment;
            const joined = parts.filter((p) => p !== "").join(CHAIN_ROLL_DELIMITER + " ");
            ta.value = joined;

            const prefix = parts.slice(0, activeIndex).filter((p) => p !== "").join(CHAIN_ROLL_DELIMITER + " ");
            const prefixLength = prefix ? prefix.length + (CHAIN_ROLL_DELIMITER + " ").length : 0;
            const caret = prefixLength + parts[activeIndex].length;
            ta.focus();
            ta.selectionStart = ta.selectionEnd = caret;
        } else {
            this.formulaComponent.inputEl.value = newSegment;
        }
    }
}
