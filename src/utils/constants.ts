export const CHAIN_RESULT_SEPARATOR = ";";
export const CHAIN_ROLL_DELIMITER = ";";
export const CONDITIONAL_REGEX = /(?:(?<operator>=|=!|<|>|<=|>=|=<|=>|\-=|=\-)(?<comparer>\d+))/g;
export const DATAVIEW_REGEX = /(?:(?<roll>\d+)[Dd]?)?dv\((?<query>.+)\)(?:\|(?<collapse>[\+-]))?(?:\|(?<types>[^\+-]+))?/u;
export const DICE_REGEX = /(?<dice>(?<roll>\d+)(?:[Dd]?\[?(?:-?\d+\s?,)?\s?(?:-?\d+|%|F)\]?)?)(?<conditional>(?:(?:=|=!|<|>|<=|>=|=<|=>|\-=|=\-)\d+)*)?/;
export const DICE_TRAY_NO_DICE_MSG = "Roll has no dice."
export const DICE_TRAY_NOT_SUPPORTED_MSG = "The Dice Tray only supports dice rolls."
export const MATH_REGEX = /[\(\^\+\-\*\/\)]/;
export const OMITTED_REGEX = /(?<roll>\d+)?[Dd](?<faces>\[?(?:-?\d+\s?,)?\s?(?:-?\d+|%|F)\]?)?(?<conditional>(?:(?:=|=!|<|>|<=|>=|=<|=>|\-=|=\-)\d+)*)?/;
export const SECTION_REGEX = /(?:(?<roll>\d+)[Dd])?(?:\[.*\]\(|\[\[)(?<link>.+)(?:\]\]|\))\|?(?<types>.+)?/;
export const TABLE_REGEX = /(?<diceRoll>.*)?(?:\[.*\]\(|\[\[)(?<link>.+?)#?\^(?<block>.+?)(?:\]\]|\))(?:\|(?<header>.+))?/;
export const TAG_REGEX = /(?:(?<roll>\d+)[Dd])?#(?<query>[\p{Letter}\p{Emoji_Presentation}\w/-]+)(?:\|(?<collapse>[\+-]))?(?:\|(?<types>[^\+-]+))?/u;
