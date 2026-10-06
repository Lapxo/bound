/** The verbs bound answers by name: fold reads, land writes signed lines, sign is a key's act. A directory with no verb is a fold of that place. */
export const VERB_NAMES = ['fold', 'land', 'sign'] as const;
export type VerbName = (typeof VERB_NAMES)[number];

/** Every flag the CLI reads, spelled once; a valued flag takes the argument after it. */
export const FLAGS = { as: '--as', check: '--check', key: '--key', keyFile: '--key-file', signer: '--signer', place: '--place' } as const;
export const VALUED: readonly string[] = [FLAGS.keyFile, FLAGS.key, FLAGS.signer, FLAGS.as, FLAGS.place];

/** Views the CLI renders from these names, never from a handwritten usage string. */
export const NAMED_VIEWS = { help: 'help', lines: 'lines', because: 'because' } as const;

export const EXIT = { closed: 0, refuse: 1, usage: 2 } as const;

export const helpLines = (): readonly string[] => [
  `verbs ${VERB_NAMES.join(' ')}`,
  `flags ${Object.values(FLAGS).join(' ')}`,
];
