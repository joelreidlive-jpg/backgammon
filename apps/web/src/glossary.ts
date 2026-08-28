/**
 * The words the coach uses, defined.
 *
 * Backgammon advice is written in its own vocabulary — "you left a blot in
 * front of a four prime" means nothing until someone says what a blot and a
 * prime are — so the terms are linked wherever they appear rather than left
 * for the player to look up elsewhere.
 */
export interface GlossaryEntry {
  /** Stable id, also the heading shown in the glossary. */
  readonly term: string;
  /**
   * Other spellings that mean the same thing, including plurals and verb
   * forms, since the coach writes "hits" and "blots" as readily as "hit".
   */
  readonly aliases?: readonly string[];
  readonly definition: string;
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: 'anchor',
    aliases: ['anchors', 'anchored', 'anchoring'],
    definition:
      'Two or more of your checkers on a point in your opponent’s home board. It is a safe landing place if you are hit, and it stops them closing their board against you.',
  },
  {
    term: 'back checker',
    aliases: ['back checkers'],
    definition:
      'One of your checkers still in your opponent’s home board, furthest from home. Getting them out — escaping — is most of what the early game is about.',
  },
  {
    term: 'back game',
    aliases: ['back games'],
    definition:
      'Deliberately holding two anchors deep in your opponent’s home board and playing to hit them late. Hard to play well, and the fallback when you are already far behind.',
  },
  {
    term: 'bar',
    definition:
      'The ridge down the middle of the board. A checker that has been hit sits there and must re-enter in the opponent’s home board before you may make any other move.',
  },
  {
    term: 'bear in',
    aliases: ['bearing in', 'bears in'],
    definition: 'Bringing your last checkers into your own home board, ready to bear off.',
  },
  {
    term: 'bear off',
    aliases: ['bearing off', 'bears off', 'bear-off', 'borne off'],
    definition:
      'Removing checkers from the board once all fifteen are in your home board. First player to bear off all fifteen wins.',
  },
  {
    term: 'blitz',
    aliases: ['blitzing'],
    definition:
      'Attacking hard: hitting and making home board points quickly to shut a checker out on the bar rather than racing.',
  },
  {
    term: 'blot',
    aliases: ['blots'],
    definition:
      'A single checker alone on a point. It can be hit and sent to the bar, which costs you every pip it had travelled.',
  },
  {
    term: 'builder',
    aliases: ['builders'],
    definition:
      'A spare checker placed where it can help make a new point next turn. Builders are why leaving a blot is sometimes worth the risk.',
  },
  {
    term: 'closeout',
    aliases: ['closed board', 'close out'],
    definition:
      'All six points of your home board made. An opponent on the bar cannot enter at all and must wait, losing every roll, until you open a point.',
  },
  {
    term: 'cover',
    aliases: ['covers', 'covered', 'covering'],
    definition: 'Placing a second checker on a blot, turning it into a made point that is safe.',
  },
  {
    term: 'Crawford game',
    aliases: ['Crawford', 'Crawford rule'],
    definition:
      'In match play, the one game immediately after either player reaches match point. The doubling cube may not be used in it.',
  },
  {
    term: 'crossing',
    aliases: ['crossings'],
    definition:
      'Moving a checker from one quadrant of the board into the next. Counting the crossings each side still owes is the quickest way to judge who is winning a race, since every one of them has to be paid for by a roll.',
  },
  {
    term: 'dance',
    aliases: ['dances', 'danced', 'dancing', 'fan', 'fans'],
    definition:
      'To fail to enter from the bar because every point you could land on is blocked. You lose the whole turn.',
  },
  {
    term: 'direct shot',
    aliases: ['direct shots'],
    definition:
      'A blot within six pips of an enemy checker, so a single die can hit it. Far more dangerous than an indirect shot.',
  },
  {
    term: 'double',
    aliases: ['doubles', 'doubled', 'doubling'],
    definition:
      'Offering the doubling cube to play for twice the stake. Your opponent must take, and own the cube, or drop and concede the current stake.',
  },
  {
    term: 'doubling cube',
    aliases: ['cube'],
    definition:
      'The six-sided cube marked 2, 4, 8, 16, 32, 64 that tracks the stake. Using it well is worth more than checker play at every level above beginner.',
  },
  {
    term: 'drop',
    aliases: ['drops', 'dropped', 'dropping', 'pass'],
    definition:
      'Refusing a double, conceding the game at the current stake. Correct whenever your chances of winning are worse than about 25%.',
  },
  {
    term: 'equity',
    definition:
      'What a position is worth on average, in points, if it were played out to the end. The coach compares plays by their equity, and the difference is what it calls a mistake.',
  },
  {
    term: 'gammon',
    aliases: ['gammons', 'gammoned'],
    definition:
      'A win where the loser has borne off no checkers at all. It counts double, which is why attacking games are worth more than the race alone suggests.',
  },
  {
    term: 'golden point',
    definition:
      'Your five point, and your opponent’s. The single most valuable point on the board: it blocks their escape and anchors yours.',
  },
  {
    term: 'hit',
    aliases: ['hits', 'hitting'],
    definition:
      'Landing on a lone enemy checker and sending it to the bar. It gains you the pips it had made, and buys time while they re-enter.',
  },
  {
    term: 'holding game',
    aliases: ['holding games'],
    definition:
      'Keeping an anchor behind your opponent’s checkers while you are behind in the race, playing to hit a shot as they come home.',
  },
  {
    term: 'home board',
    aliases: ['home boards', 'inner board'],
    definition:
      'The quadrant holding your one to six points, where your checkers must gather before you can bear off, and where a hit opponent must re-enter.',
  },
  {
    term: 'indirect shot',
    aliases: ['indirect shots'],
    definition:
      'A blot more than six pips away, hittable only by combining both dice. Roughly a third as likely to be hit as a direct shot.',
  },
  {
    term: 'pip',
    aliases: ['pips'],
    definition:
      'One step of movement. Also the spots on the dice; a roll of 6-4 moves ten pips in total.',
  },
  {
    term: 'pip count',
    definition:
      'The total pips each side still needs to bring every checker home and off. Comparing the two counts tells you whether you are racing or holding.',
  },
  {
    term: 'point',
    aliases: ['points', 'made point', 'made points'],
    definition:
      'One of the twenty-four triangles. To "make" a point is to hold it with two or more checkers, which stops your opponent landing there. The word also means a unit of score: a plain game is worth one point, and the cube multiplies it.',
  },
  {
    term: 'prime',
    aliases: ['primes', 'priming'],
    definition:
      'Consecutive made points in a row. A six prime cannot be jumped by any die, so anything trapped behind it stays trapped.',
  },
  {
    term: 'race',
    aliases: ['racing'],
    definition:
      'A position where the two sides have passed each other and can no longer hit. All that is left is running home, and the lower pip count wins.',
  },
  {
    term: 'shot',
    aliases: ['shots'],
    definition:
      'A chance to hit. "Leaving a shot" means giving your opponent numbers that hit you; how many of the thirty-six rolls hit is the measure of the risk.',
  },
  {
    term: 'slot',
    aliases: ['slots', 'slotted', 'slotting'],
    definition:
      'Deliberately leaving a blot on a point you want, intending to cover it next turn. Bold, and best when their home board is weak.',
  },
  {
    term: 'split',
    aliases: ['splits', 'splitting'],
    definition:
      'Moving one of your two back checkers to a neighbouring point, so both can look for an anchor rather than sitting stacked.',
  },
  {
    term: 'stack',
    aliases: ['stacks', 'stacked', 'stacking'],
    definition:
      'Piling too many checkers on one point. Stacked checkers do no work: they cannot make new points and they waste pips.',
  },
  {
    term: 'take',
    aliases: ['takes', 'taking'],
    definition:
      'Accepting a double. You now own the cube and are the only one who may double next, which is worth something in itself.',
  },
  {
    term: 'timing',
    definition:
      'Having spare pips to play without breaking the points you want to keep. Running out of timing forces you to tear down your own position.',
  },
  {
    term: 'wastage',
    aliases: ['waste'],
    definition:
      'Pips that do no work: a 6 played on the ace point wastes five of them. Even distribution while bearing in is what keeps wastage down, and a stack deep in your home board is what creates it.',
  },
];

/** Longest first, so "pip count" wins over "pip" and "back game" over "game". */
const MATCHES: readonly { readonly phrase: string; readonly entry: GlossaryEntry }[] = GLOSSARY.flatMap(
  (entry) => [entry.term, ...(entry.aliases ?? [])].map((phrase) => ({ phrase, entry })),
).sort((a, b) => b.phrase.length - a.phrase.length);

export function glossaryEntry(term: string): GlossaryEntry | null {
  return GLOSSARY.find((entry) => entry.term === term) ?? null;
}

/** A run of coaching text, either plain or a term worth defining. */
export type TextPart =
  | { readonly text: string; readonly entry?: undefined }
  | { readonly text: string; readonly entry: GlossaryEntry };

function isWordChar(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}]/u.test(character);
}

/**
 * Split text so each glossary term can be rendered as a link.
 *
 * Only the first mention of a term is linked: a paragraph with "blot" three
 * times reads as advice, not as a page of hyperlinks. Matching is
 * case-insensitive but whole-word, so "pip" does not light up inside
 * "piping", and the text itself is never rewritten — what the coach wrote is
 * what the player reads.
 */
export function splitOnTerms(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const linked = new Set<string>();
  let plain = '';
  let index = 0;

  while (index < text.length) {
    const match = MATCHES.find(({ phrase, entry }) => {
      if (linked.has(entry.term)) return false;
      if (text.slice(index, index + phrase.length).toLowerCase() !== phrase.toLowerCase()) {
        return false;
      }
      return !isWordChar(text[index - 1]) && !isWordChar(text[index + phrase.length]);
    });

    if (match === undefined) {
      plain += text[index];
      index += 1;
      continue;
    }

    if (plain !== '') parts.push({ text: plain });
    plain = '';
    parts.push({ text: text.slice(index, index + match.phrase.length), entry: match.entry });
    linked.add(match.entry.term);
    index += match.phrase.length;
  }

  if (plain !== '') parts.push({ text: plain });
  return parts;
}
