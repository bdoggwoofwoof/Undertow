/* Undertow — emotion data.
   Grid words: Undertow's own list and arrangement on two axes (energy, pleasantness).
   Wheel: built on Robert Plutchik's 1980 psychoevolutionary model (8 primary emotions,
   3 intensities each, 8 primary dyads). The model is a theory; this drawing and these
   colors are Undertow's own.
   Arabic: sh = Shami (Levantine), fu = Fusha (MSA), tr = transliteration of the Shami.
   First draft — check with a speaker. */

const QUADS = {
  hu: { name: 'High energy, unpleasant', short: 'Charged', p: -1, e: 1 },
  hp: { name: 'High energy, pleasant', short: 'Bright', p: 1, e: 1 },
  lu: { name: 'Low energy, unpleasant', short: 'Heavy', p: -1, e: -1 },
  lp: { name: 'Low energy, pleasant', short: 'Still', p: 1, e: -1 },
};

/* Each quadrant: 16 words, most intense first (they sit at the outer corner of the grid). */
const GRID = {
  hu: [
    ['furious', 'معصّب كتير', 'غاضب جدًا', "mʿaṣṣab ktīr"],
    ['panicked', 'مرعوب', 'مذعور', 'marʿūb'],
    ['angry', 'معصّب', 'غاضب', "mʿaṣṣab"],
    ['scared', 'خايف', 'خائف', 'khāyef'],
    ['overwhelmed', 'مضغوط', 'مُثقَل', 'maḍghūṭ'],
    ['disgusted', 'قرفان', 'مشمئز', "ʾarfān"],
    ['anxious', 'قلقان', 'قلق', "ʾalʾān"],
    ['shocked', 'مصدوم', 'مصدوم', 'maṣdūm'],
    ['stressed', 'متوتّر', 'متوتّر', 'mitwattir'],
    ['frustrated', 'مقهور', 'محبَط', "maʾhūr"],
    ['jealous', 'غيران', 'غيور', 'ghayrān'],
    ['embarrassed', 'مستحي', 'محرَج', 'mistiḥi'],
    ['tense', 'متشنّج', 'متشنّج', 'mitshannij'],
    ['irritated', 'متضايق', 'منزعج', "mitḍāyeʾ"],
    ['worried', 'مهموم', 'مهموم', 'mahmūm'],
    ['restless', 'مش مرتاح', 'مضطرب', 'mish mirtāḥ'],
  ],
  hp: [
    ['ecstatic', 'طاير من الفرح', 'في غاية السعادة', 'ṭāyer min il-faraḥ'],
    ['thrilled', 'متحمّس كتير', 'متحمّس جدًا', 'mitḥammes ktīr'],
    ['excited', 'متحمّس', 'متحمّس', 'mitḥammes'],
    ['joyful', 'فرحان', 'فرحان', 'farḥān'],
    ['inspired', 'ملهَم', 'مُلهَم', 'mulham'],
    ['proud', 'فخور', 'فخور', 'fakhūr'],
    ['energized', 'نشيط', 'نشيط', 'nashīṭ'],
    ['eager', 'متشوّق', 'متشوّق', 'mitshawweʾ'],
    ['motivated', 'متحفّز', 'متحفّز', 'mitḥaffez'],
    ['playful', 'مرِح', 'مرِح', 'mariḥ'],
    ['happy', 'مبسوط', 'سعيد', 'mabsūṭ'],
    ['confident', 'واثق من حالي', 'واثق', 'wāthe min ḥāli'],
    ['hopeful', 'متفائل', 'متفائل', 'mitfāʾel'],
    ['curious', 'فضولي', 'فضولي', 'fuḍūli'],
    ['surprised', 'متفاجئ', 'متفاجئ', "mitfājeʾ"],
    ['amused', 'مستمتع', 'مستمتع', 'mistamteʿ'],
  ],
  lu: [
    ['hopeless', 'يائس', 'يائس', 'yāʾes'],
    ['grieving', 'مفجوع', 'مفجوع', 'mafjūʿ'],
    ['empty', 'فاضي', 'فارغ', 'fāḍi'],
    ['lonely', 'وحيد', 'وحيد', 'waḥīd'],
    ['numb', 'متبلّد', 'متبلّد', 'mitballed'],
    ['ashamed', 'خجلان', 'خَجِل', 'khajlān'],
    ['hurt', 'مجروح', 'مجروح', 'majrūḥ'],
    ['sad', 'زعلان', 'حزين', 'zaʿlān'],
    ['exhausted', 'هلكان', 'منهَك', 'halkān'],
    ['guilty', 'حاسس بالذنب', 'مذنب', 'ḥāses bi-dh-dhanb'],
    ['homesick', 'مشتاق لأهلي', 'مشتاق للوطن', "mishtāʾ la-ahli"],
    ['disappointed', 'خيبان أملي', 'خائب الأمل', 'khaybān amali'],
    ['left out', 'حاسس حالي برّا', 'مُستبعَد', 'ḥāses ḥāli barra'],
    ['discouraged', 'فاقد الحماس', 'فاقد الحماس', 'fāʾed il-ḥamās'],
    ['tired', 'تعبان', 'تعبان', 'taʿbān'],
    ['bored', 'زهقان', 'ملول', "zahʾān"],
  ],
  lp: [
    ['peaceful', 'رايق', 'هادئ البال', "rāyeʾ"],
    ['loved', 'محبوب', 'محبوب', 'maḥbūb'],
    ['grateful', 'ممنون', 'ممتنّ', 'mamnūn'],
    ['safe', 'حاسس بالأمان', 'آمِن', 'ḥāses bil-amān'],
    ['content', 'مرتاح', 'قانع', 'mirtāḥ'],
    ['relieved', 'مطمّن', 'مُطمئن', 'mṭammen'],
    ['calm', 'هادي', 'هادئ', 'hādi'],
    ['tender', 'حنون', 'حنون', 'ḥanūn'],
    ['connected', 'قريب من الناس', 'مرتبط بالآخرين', "ʾarīb min in-nās"],
    ['satisfied', 'راضي', 'راضٍ', 'rāḍi'],
    ['relaxed', 'مسترخي', 'مسترخٍ', 'mistarkhi'],
    ['balanced', 'متوازن', 'متوازن', 'mitwāzen'],
    ['comfortable', 'مرتاح', 'مرتاح', 'mirtāḥ'],
    ['reflective', 'متأمّل', 'متأمّل', 'mitʾammel'],
    ['carefree', 'ما عندي هم', 'خالي البال', 'mā ʿindi hamm'],
    ['rested', 'مستريح', 'مستريح', 'mistrīḥ'],
  ],
};

/* Plutchik: 8 primaries clockwise, each [strong, basic, mild], with Arabic nouns (Fusha; Shami in common use is the same for most).
   p = pleasantness (-2..2), e = energy (-2..2) for each intensity, used to place wheel words on the grid for Patterns. */
const WHEEL = [
  { id: 'joy', words: [['ecstasy', 'نشوة', 'nashwa'], ['joy', 'فرح', 'faraḥ'], ['serenity', 'صفاء', 'ṣafāʾ']], p: [2, 2, 1.5], e: [2, 1, -1] },
  { id: 'trust', words: [['admiration', 'إعجاب', 'iʿjāb'], ['trust', 'ثقة', 'thiqa'], ['acceptance', 'قبول', 'qubūl']], p: [2, 1.5, 1], e: [1, -0.5, -1] },
  { id: 'fear', words: [['terror', 'رعب', 'ruʿb'], ['fear', 'خوف', 'khawf'], ['apprehension', 'توجّس', 'tawajjus']], p: [-2, -1.5, -1], e: [2, 1.5, 0.5] },
  { id: 'surprise', words: [['amazement', 'ذهول', 'dhuhūl'], ['surprise', 'مفاجأة', 'mufājaʾa'], ['distraction', 'شرود', 'shurūd']], p: [0.5, 0.2, -0.3], e: [2, 1.5, -0.5] },
  { id: 'sadness', words: [['grief', 'فجيعة', 'fajīʿa'], ['sadness', 'حزن', 'ḥuzn'], ['pensiveness', 'شجن', 'shajan']], p: [-2, -1.5, -0.8], e: [-1, -1.5, -1] },
  { id: 'disgust', words: [['loathing', 'بُغض', 'bughḍ'], ['disgust', 'اشمئزاز', 'ishmiʾzāz'], ['boredom', 'ملل', 'malal']], p: [-2, -1.5, -0.8], e: [1, 0.5, -1.5] },
  { id: 'anger', words: [['rage', 'غيظ', 'ghayẓ'], ['anger', 'غضب', 'ghaḍab'], ['annoyance', 'انزعاج', 'inziʿāj']], p: [-2, -1.5, -1], e: [2, 1.5, 0.5] },
  { id: 'anticipation', words: [['vigilance', 'يقظة', 'yaqẓa'], ['anticipation', 'ترقّب', 'taraqqub'], ['interest', 'اهتمام', 'ihtimām']], p: [0.3, 0.8, 1], e: [2, 1, 0.5] },
];
/* Primary dyads sit between neighbours: index i lies between WHEEL[i] and WHEEL[i+1]. */
const DYADS = [
  ['love', 'حب', 'ḥubb', 2, 0.5],
  ['submission', 'خضوع', 'khuḍūʿ', -0.5, -0.5],
  ['awe', 'رهبة', 'rahba', 0.3, 1],
  ['disapproval', 'استنكار', 'istinkār', -1, 0],
  ['remorse', 'ندم', 'nadam', -1.5, -0.5],
  ['contempt', 'ازدراء', 'izdirāʾ', -1.5, 0.5],
  ['aggressiveness', 'عدوانية', 'ʿudwāniyya', -1.5, 1.5],
  ['optimism', 'تفاؤل', 'tafāʾul', 1.5, 1],
];

const BODY = [
  ['head', 'Head', 'راس'], ['jaw', 'Face and jaw', 'وجه وفك'], ['throat', 'Throat', 'زلعوم'],
  ['shoulders', 'Shoulders', 'كتاف'], ['chest', 'Chest', 'صدر'], ['stomach', 'Stomach', 'بطن'],
  ['arms', 'Arms', 'إيدين'], ['hands', 'Hands', 'كفوف'], ['back', 'Back', 'ضهر'],
  ['hips', 'Hips', 'وراك'], ['legs', 'Legs', 'إجرين'], ['feet', 'Feet', 'إجرين (قدم)'],
];

const TAG_GROUPS = {
  people: ['alone', 'family', 'friends', 'roommates', 'coworkers', 'classmates', 'church'],
  places: ['home', 'work', 'school', 'outside', 'car', 'gym', 'café'],
  doing: ['working', 'studying', 'resting', 'scrolling', 'exercising', 'cooking', 'praying', 'talking', 'driving', 'creating'],
};

/* Tools. q = quadrants it suits. steps = what to do. min = rough minutes. */
const TOOLS = [
  { id: 'box', name: 'Box breathing', q: ['hu'], min: 2, kind: 'Breath',
    why: 'Slow, even breaths tell your body the alarm can stand down.',
    steps: ['Breathe in for 4.', 'Hold for 4.', 'Breathe out for 4.', 'Hold for 4.', 'Repeat 4 to 6 rounds.'], timer: 'box' },
  { id: 'sigh', name: 'Physiological sigh', q: ['hu'], min: 1, kind: 'Breath',
    why: 'Two inhales and a long exhale is one of the quickest ways to settle.',
    steps: ['Breathe in through your nose.', 'Take a second short sip of air on top.', 'Let it all out slowly through your mouth.', 'Do it 3 to 5 times.'] },
  { id: 'ground', name: '5-4-3-2-1 grounding', q: ['hu', 'lu'], min: 3, kind: 'Grounding',
    why: 'Naming what your senses notice brings you back to the room.',
    steps: ['Name 5 things you can see.', 'Name 4 things you can feel touching you.', 'Name 3 things you can hear.', 'Name 2 things you can smell.', 'Name 1 thing you can taste.'] },
  { id: 'feet', name: 'Feet on the floor', q: ['hu'], min: 1, kind: 'Grounding',
    why: 'Pressing down gives your body something solid to notice.',
    steps: ['Sit or stand with both feet flat.', 'Press them into the floor for 5 seconds.', 'Release and notice the weight of your body.', 'Repeat three times.'] },
  { id: 'window', name: 'Window of tolerance check', q: ['hu', 'lu'], min: 2, kind: 'Check',
    why: 'Knowing whether you are too wound up, too shut down, or in range tells you what to try next.',
    steps: ['Ask: am I revved up (racing, tight, on edge)?', 'Or shut down (flat, foggy, far away)?', 'Or in range (I can think and feel at the same time)?', 'Revved up: try breathing or grounding. Shut down: try movement, cold water on hands, or a voice you trust.'] },
  { id: 'walk', name: 'Ten-minute walk', q: ['lu', 'hu'], min: 10, kind: 'Movement',
    why: 'Moving shifts energy in either direction.',
    steps: ['Step outside if you can.', 'Walk at an easy pace for ten minutes.', 'Notice three things around you you hadn\'t seen.'] },
  { id: 'shake', name: 'Shake it out', q: ['hu'], min: 1, kind: 'Movement',
    why: 'Stress hormones mean the body is ready to act; shaking spends some of that.',
    steps: ['Stand up.', 'Shake your hands, then arms, then legs, for 30 to 60 seconds.', 'Stop, stand still, and breathe out slowly.'] },
  { id: 'thought', name: 'Thought record', q: ['hu', 'lu'], min: 5, kind: 'Thinking',
    why: 'Writing the thought down lets you look at it rather than through it.',
    steps: ['What happened?', 'What went through your mind?', 'What is the evidence for it, and against it?', 'What is a more balanced way to say it?'], journal: true },
  { id: 'name', name: 'Name it to tame it', q: ['hu', 'lu'], min: 1, kind: 'Thinking',
    why: 'Putting a precise word on a feeling lowers its intensity a little.',
    steps: ['Say the feeling word out loud or in your head: "I\'m feeling ___."', 'Add where you feel it in your body.', 'Add one thing it might be asking for.'] },
  { id: 'reach', name: 'Reach out to someone', q: ['lu'], min: 5, kind: 'Connection',
    why: 'A short message to someone safe counts.',
    steps: ['Pick one person you trust.', 'Send a short message — it doesn\'t have to explain everything.', 'Something like: "Rough day. Up for a call later?"'] },
  { id: 'kind', name: 'Kind words to yourself', q: ['lu'], min: 2, kind: 'Self-compassion',
    why: 'Talking to yourself like you would to a friend is a skill, not a mood.',
    steps: ['Put a hand on your chest.', 'Say: "This is hard right now."', 'Say: "Other people feel this too."', 'Say: "What would help me a little?"'] },
  { id: 'small', name: 'One small thing', q: ['lu'], min: 5, kind: 'Action',
    why: 'When energy is low, a tiny finished task beats a big plan.',
    steps: ['Pick something that takes five minutes: a glass of water, a shower, one dish.', 'Do only that.', 'Notice that it\'s done.'] },
  { id: 'savor', name: 'Savor it', q: ['hp', 'lp'], min: 2, kind: 'Savoring',
    why: 'Staying with a good moment helps it stick.',
    steps: ['Notice what is good right now.', 'Stay with it for 20 seconds longer than you would.', 'Write one line about it.'], journal: true },
  { id: 'share', name: 'Share the good news', q: ['hp'], min: 3, kind: 'Connection',
    why: 'Telling someone about a good thing makes it bigger for both of you.',
    steps: ['Pick someone who will be glad for you.', 'Tell them what happened and why it mattered.'] },
  { id: 'channel', name: 'Use the energy', q: ['hp', 'hu'], min: 15, kind: 'Action',
    why: 'High energy is fuel; point it at something.',
    steps: ['Pick one task that has been waiting.', 'Set a 15-minute timer.', 'Work on it until the timer ends.'] },
  { id: 'grat', name: 'Three good things', q: ['lp', 'lu', 'hp'], min: 3, kind: 'Gratitude',
    why: 'Looking for what went well trains your attention to find it.',
    steps: ['Write three things that went well today.', 'For each, add why it happened.'], journal: true },
  { id: 'rest', name: 'Let yourself rest', q: ['lp', 'lu'], min: 10, kind: 'Rest',
    why: 'Calm is a good time to recharge, not just to get more done.',
    steps: ['Put the phone face down.', 'Lie down or sit comfortably for ten minutes.', 'Let your breathing be slow.'] },
  { id: 'pray', name: 'Pray or read scripture', q: ['hu', 'lu', 'lp', 'hp'], min: 5, kind: 'Faith', optional: true,
    why: 'For many people, bringing a feeling to God is a way to hold it.',
    steps: ['Tell God plainly what you are feeling.', 'Read a short passage (Psalm 23, 34, 42, 46 or 139 are good places to start).', 'Sit in silence for a minute.'] },
];

const PROMPTS = {
  hu: 'What set this off, and what do you need right now?',
  hp: 'What is going well? What helped it happen?',
  lu: 'What feels heavy? What would be a little kinder to yourself right now?',
  lp: 'What is making this moment calm? How could you get more of it?',
};
