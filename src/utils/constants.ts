export const CONDITIONAL_REGEX = /(?:(?<operator>=|=!|<|>|<=|>=|=<|=>|\-=|=\-)(?<comparer>\d+))/g;
export const DATAVIEW_REGEX = /(?:(?<roll>\d+)[Dd]?)?dv\((?<query>.+)\)(?:\|(?<collapse>[\+-]))?(?:\|(?<types>[^\+-]+))?/u;
export const DICE_REGEX = /(?<dice>(?<roll>\d+)(?:[Dd]?\[?(?:-?\d+\s?,)?\s?(?:-?\d+|%|F)\]?)?)(?<conditional>(?:(?:=|=!|<|>|<=|>=|=<|=>|\-=|=\-)\d+)*)?/;
export const MATH_REGEX = /[\(\^\+\-\*\/\)]/;
export const OMITTED_REGEX = /(?<roll>\d+)?[Dd](?<faces>\[?(?:-?\d+\s?,)?\s?(?:-?\d+|%|F)\]?)?(?<conditional>(?:(?:=|=!|<|>|<=|>=|=<|=>|\-=|=\-)\d+)*)?/;
export const SECTION_REGEX = /(?:(?<roll>\d+)[Dd])?(?:\[.*\]\(|\[\[)(?<link>.+)(?:\]\]|\))\|?(?<types>.+)?/;
export const TABLE_REGEX = /(?<diceRoll>.*)?(?:\[.*\]\(|\[\[)(?<link>.+?)#?\^(?<block>.+?)(?:\]\]|\))(?:\|(?<header>.+))?/;
export const TAG_REGEX = /(?:(?<roll>\d+)[Dd])?#(?<query>[\p{Letter}\p{Emoji_Presentation}\w/-]+)(?:\|(?<collapse>[\+-]))?(?:\|(?<types>[^\+-]+))?/u;

export const CHAINED_ROLL_DELIMITER = ";";
export const RESULT_SEPARATOR = "; ";
export const RESULT_SEPARATOR_OVERRIDE_INDICATOR = "~";
export const ROLL_ALIAS_INDICATOR = "@";

// export const RESULT_SEPARATOR_OVERRIDE_REGEX = new RegExp(`/^${RESULT_SEPARATOR_OVERRIDE_INDICATOR}\s*"(.*?)"$/s`, 's');
export const RESULT_SEPARATOR_OVERRIDE_REGEX = /^~\s*"(.*?)"$/s;
// export const ROLL_ALIAS_REGEX = new RegExp(`/\\s*${ROLL_ALIAS_INDICATOR}\\s"(.+?)"/s`, 's');
export const ROLL_ALIAS_REGEX = /\s*@\s*"(.+?)"\s*$/s;
// export const ROLL_ALIAS_REGEX = new RegExp(`/\\s*${ROLL_ALIAS_INDICATOR}\\s*"(.+?)"\\s*$/s`, 's');
// export const CHAINED_ROLL_ALIAS_REGEX = new RegExp(`^\\s*${RESULT_SEPARATOR_OVERRIDE_INDICATOR}\\s*".*"${ROLL_ALIAS_REGEX}`, 's');
export const CHAINED_ROLL_ALIAS_REGEX = /^\s*(?:~\s*".*?")?\s*@\s*"(.+?)"\s*$/s;
// export const CHAINED_ROLL_ALIAS_REGEX = new RegExp(`/^\\s*(?:${RESULT_SEPARATOR_OVERRIDE_INDICATOR}\\s*".*?")?\\s*${ROLL_ALIAS_INDICATOR}\\s*"(.+?)"\\s*$/s`, 's');
