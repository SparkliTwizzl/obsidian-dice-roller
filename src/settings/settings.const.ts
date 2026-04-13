import { Round, ExpectedValue } from "../types/api";
import { DEFAULT_ICONS } from "../view/view.icons";
import copy from "fast-copy";
import { ButtonPosition, type DiceRollerSettings } from "./settings.types";
import { CHAINED_RESULT_SEPARATOR } from "src/utils/constants";

export const DEFAULT_SETTINGS: DiceRollerSettings = {
    position: ButtonPosition.RIGHT,
    showFudgeIcon: false,
    rollLinksForTags: false,
    copyContentButton: true,
    customFormulas: [],
    displayFormulaForMod: true,
    displayResultsInline: false,
    displayFormulaAfter: false,
    escapeDiceMod: true,
    signed: false,
    displayLookupRoll: true,
    formulas: {},
    defaultRoll: 1,
    defaultFace: 100,
    renderer: false,
    renderAllDice: false,
    addToView: false,
    renderTime: 2000,
    colorfulDice: false,
    scaler: 1,
    diceColor: "#202020",
    textColor: "#ffffff",
    textFont: "Arial",
    showLeafOnStartup: true,
    narrativeSymbolSet: "Genesys",
    displayAsSymbols: false,
    
    displayAsEmbed: true,
    round: Round.None,
    initialDisplay: ExpectedValue.Roll,
    icons: copy(DEFAULT_ICONS),
    showRenderNotice: true,
    diceModTemplateFolders: {},
    replaceDiceModInLivePreview: true,
    enableChainRoller: false,
    enableRollAliasing: false,
    chainedResultSeparator: CHAINED_RESULT_SEPARATOR,
    allowChainedSeparatorLineBreaks: false,
    version: null,
    viewResults: []
};
