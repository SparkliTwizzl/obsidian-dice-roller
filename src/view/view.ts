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
import { Icons } from "src/utils/icons";
import { CHAIN_ROLL_DELIMITER } from "src/utils/constants";
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
    noResultsEl: HTMLSpanElement;
    rollButton: ButtonComponent;
    saveButton: ExtraButtonComponent;
    stack: StackRoller;
    gridEl: HTMLDivElement;
    formulaEl: HTMLDivElement;
    get customFormulas() {
        return this.plugin.data.customFormulas;
    }
    custom = "";
    // Per-segment state for chained formulas
    segmentStates: Array<{
        formula: Map<DiceIcon, number>;
        add: number;
        adv: boolean;
        dis: boolean;
    }> = [
        { formula: new Map(), add: 0, adv: false, dis: false }
    ];

    formulaComponent: TextAreaComponent;
    resultEl: HTMLDivElement;
    activeSegmentIndex: number | null = null;

    #icons = IconManager;
    getActiveState() {
        const index = this.activeSegmentIndex ?? this.segmentStates.length - 1;
        if (index < 0) return this.segmentStates[0];
        if (index >= this.segmentStates.length) {
            // create missing states up to index
            while (this.segmentStates.length <= index) {
                this.segmentStates.push({ formula: new Map(), add: 0, adv: false, dis: false });
            }
        }
        return this.segmentStates[index];
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

    async onOpen() {
        //build ui

        this.display();
    }

    async display() {
        this.contentEl.empty();

        this.gridEl = this.contentEl.createDiv("dice-roller-grid");
        this.formulaEl = this.contentEl.createDiv("dice-roller-formula");

        const headerEl = this.contentEl.createDiv("results-header-container");
        headerEl.createEl("h4", { cls: "results-header", text: "Results" });
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

    #formula: Map<DiceIcon, number> = new Map();
    buildButtons() {
        this.gridEl.empty();

        const buttons = this.gridEl.createDiv("dice-buttons");
        const activeState = this.getActiveState();
        for (const icon of this.plugin.data.icons) {
            this.#icons.registerIcon(icon.id, icon.shape, icon.text);
            new ExtraButtonComponent(buttons.createDiv("dice-button"))
                .setIcon(icon.id)
                .extraSettingsEl.onClickEvent((evt) => {
                    if (evt.type === "auxclick") {
                        this.roll(icon.formula);
                        return;
                    }
                    const state = this.getActiveState();
                    if (!state.formula.has(icon)) {
                        state.formula.set(icon, 0);
                    }
                    let amount = state.formula.get(icon) ?? 0;
                    amount += evt.getModifierState("Shift") ? -1 : 1;
                    state.formula.set(icon, amount);
                    this.setFormula();
                });
        }

        const advDis = this.gridEl.createDiv("advantage-disadvantage");

        new ExtraButtonComponent(advDis).setIcon(Icons.MINUS).onClick(() => {
            const state = this.getActiveState();
            state.add -= 1;
            this.setFormula();
        });
        const adv = new ButtonComponent(advDis)
            .setButtonText("ADV")
            .onClick(() => {
                const state = this.getActiveState();
                state.adv = !state.adv;
                state.dis = false;

                if (state.adv) {
                    adv.setCta();
                    dis.removeCta();
                } else {
                    adv.removeCta();
                }
                this.setFormula();
            });
        if (activeState.adv) {
            adv.setCta();
        }
        const dis = new ButtonComponent(advDis)
            .setButtonText("DIS")
            .onClick(() => {
                const state = this.getActiveState();
                state.dis = !state.dis;
                state.adv = false;

                if (state.dis) {
                    dis.setCta();
                    adv.removeCta();
                } else {
                    dis.removeCta();
                }

                this.setFormula();
            });

        if (activeState.dis) {
            dis.setCta();
        }
        new ExtraButtonComponent(advDis).setIcon(Icons.PLUS).onClick(() => {
            const state = this.getActiveState();
            state.add += 1;
            this.setFormula();
        });

        // Chain button: append delimiter if single segment, otherwise insert at caret
        new ExtraButtonComponent(advDis)
            .setIcon(Icons.EDIT)
            .setTooltip("Chain Formulas")
            .onClick(() => {
                const ta = this.formulaComponent?.inputEl as HTMLTextAreaElement;
                if (!ta) return;
                // If there is no delimiter yet, always append the delimiter at the end and create a new segment.
                if (!ta.value.includes(CHAIN_ROLL_DELIMITER)) {
                    ta.value = ta.value.trimEnd() + CHAIN_ROLL_DELIMITER + " ";
                    this.segmentStates.push({ formula: new Map(), add: 0, adv: false, dis: false });
                    this.activeSegmentIndex = this.segmentStates.length - 1;
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
                if (this.segmentStates.length <= count) {
                    while (this.segmentStates.length <= count) {
                        this.segmentStates.push({ formula: new Map(), add: 0, adv: false, dis: false });
                    }
                } else {
                    this.segmentStates.splice(count, 0, { formula: new Map(), add: 0, adv: false, dis: false });
                }
                this.activeSegmentIndex = count;
                ta.focus();
                ta.selectionStart = ta.selectionEnd = position;
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

    setFormula() {
        const state = this.getActiveState();
        if (!state.formula.size && !state.add) {
            this.formulaComponent.inputEl.value = "";
            return;
        }
        const formula: { formula: string; max: number; sign: "+" | "-" }[] = [];
        for (const [icon, amount] of state.formula) {
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
                if (state.adv) {
                    mod = "kh";
                } else if (state.dis) {
                    mod = "kl";
                }
                instance.formula = instance.formula.replace(
                    /(d\d+)/,
                    `$1${mod}`
                );
            }
            str.push(`${instance.formula}`);
        }
        if (state.add !== 0) {
            if (str.length > 0) {
                str.push(state.add > 0 ? "+" : "-");
            }
            str.push(`${Math.abs(state.add)}`);
        }

        const newSegment = str.join(" ");

        const ta = this.formulaComponent?.inputEl as HTMLTextAreaElement;

        if (ta && ta.value.includes(CHAIN_ROLL_DELIMITER)) {
            const parts = ta.value.split(CHAIN_ROLL_DELIMITER).map((p) => p.trim());

            let activeIndex = this.activeSegmentIndex;
            if (activeIndex == null || activeIndex < 0 || activeIndex >= parts.length) {
                const selection = ta.selectionStart ?? ta.value.length;
                // determine active segment by caret position
                let position = 0;
                activeIndex = parts.length - 1;
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i];
                    const start = position;
                    const end = position + part.length;
                    if (selection >= start && selection <= end) {
                        activeIndex = i;
                        break;
                    }
                    position = end + (CHAIN_ROLL_DELIMITER + " ").length; // move past delimiter + space
                }
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
            let noDiceMsg = "No dice.";
            let unsupportedMsg = "The Dice Tray only supports dice rolls.";
            if (roller instanceof StackRoller) {
                roller.iconEl.detach();
                roller.containerEl.onclick = null;
                roller.buildDiceTree();
                if (!roller.children.length) {
                    throw new Error(noDiceMsg);
                }
                await roller.roll(this.plugin.data.renderer).catch((e) => {
                    throw e;
                });
            } else if (roller instanceof ChainRoller) {
                roller.iconEl?.detach();
                roller.containerEl.onclick = null;

                // Suppress workspace triggers while running sub-rolls to avoid
                // the Dice Tray listener adding individual sub-roll entries.
                const workspace: any = this.plugin.app.workspace as any;
                const originalTrigger = workspace.trigger;
                let unsupported = false;
                try {
                    workspace.trigger = () => {};

                    // Execute each sub-roller. If a sub-roller is a StackRoller, render/roll it appropriately.
                    for (const sub of roller.subRollers) {
                        if (sub instanceof StackRoller) {
                            (sub as StackRoller).buildDiceTree();
                            if (!(sub as StackRoller).children.length) {
                                throw new Error(noDiceMsg);
                            }
                            await (sub as StackRoller).roll(this.plugin.data.renderer);
                        } else {
                            // If any sub-roller is not a StackRoller, the whole
                            // ChainRoller should be treated as unsupported for
                            // the Dice Tray (match top-level non-StackRoller behavior).
                            unsupported = true;
                            break;
                        }
                    }
                } finally {
                    workspace.trigger = originalTrigger;
                }

                if (unsupported) {
                    new Notice(unsupportedMsg);
                    return;
                }

                // Build the combined result string from sub-rollers so the
                // view entry contains the final chained result (matches
                // ChainRoller.roll() behavior).
                const results: string[] = [];
                for (const sub of roller.subRollers) {
                    try {
                        const replacer = await sub.getReplacer?.();
                        if (replacer) {
                            results.push(String(replacer));
                        } else if ((sub as any).result !== undefined) {
                            results.push(String((sub as any).result));
                        }
                    } catch (e) {
                        // Ignore individual sub errors when building display.
                    }
                }

                const resultValue = results.join(" ");
                // Mirror ChainRoller internal state so other callers can
                // inspect `roller.result` if needed.
                try {
                    (roller as any).result = resultValue;
                } catch (e) {}

                const resultText = roller.getTooltip?.() ?? "";
                await this.addResult({
                    result: resultValue,
                    original: roller.original,
                    resultText: resultText,
                    timestamp: new Date().valueOf(),
                    id: nanoid(12)
                });
            } else {
                throw new Error(unsupportedMsg);
            }
        } catch (e: any) {
            new Notice("Invalid Formula: " + e.message);
        } finally {
            this.rollButton.setDisabled(false);
            this.buildButtons();
            // After rolling, restore to a single empty segment to avoid index/overlap bugs.
            this.segmentStates = [{ formula: new Map(), add: 0, adv: false, dis: false }];
            this.activeSegmentIndex = 0;
            this.setFormula();
        }
    }

    buildFormula() {
        this.formulaEl.empty();
        this.formulaComponent = new TextAreaComponent(this.formulaEl)
            .setPlaceholder("Dice Formula")
            .onChange((v) => {
                const st = this.getActiveState();
                st.formula = new Map();
            });

        // Track caret/selection to know which chained segment is active.
        try {
            const ta = this.formulaComponent.inputEl as HTMLTextAreaElement;
            const updateActive = () => {
                if (!ta) {
                    this.activeSegmentIndex = null;
                    return;
                }
                if (!ta.value.includes(CHAIN_ROLL_DELIMITER)) {
                    // single segment -> default to last (0)
                    this.activeSegmentIndex = 0;
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
            };

            ta.addEventListener("click", updateActive);
            ta.addEventListener("keyup", updateActive);
            ta.addEventListener("select", updateActive);
            ta.addEventListener("focus", updateActive);
            ta.addEventListener("input", updateActive);
        } catch (e) {
            console.error("DiceView: Failed to create text area input listener.")
        }

        const buttons = this.formulaEl.createDiv("action-buttons");
        this.saveButton = new ExtraButtonComponent(buttons)
            .setIcon(Icons.SAVE)
            .setTooltip("Save Formula")
            .onClick(() => this.save());
        this.saveButton.extraSettingsEl.addClass("dice-roller-roll");

        this.rollButton = new ButtonComponent(buttons)
            .setIcon(Icons.DICE)
            .setCta()
            .setTooltip("Roll")
            .onClick(() => this.roll());
        this.rollButton.buttonEl.addClass("dice-roller-roll");
    }

    save() {
        if (!this.formulaComponent.inputEl.value) return;
        this.plugin.data.customFormulas.push(
            this.formulaComponent.inputEl.value
        );
        this.buildButtons();
        this.plugin.saveSettings();
    }

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

    getDisplayText() {
        return "Dice Tray";
    }

    getViewType() {
        return VIEW_TYPE;
    }

    getIcon() {
        return Icons.DICE;
    }

    async onClose() {
        await super.onClose();
    }
}
