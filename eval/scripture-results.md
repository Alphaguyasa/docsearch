# Scripture eval

Run 2026-09-28T14:07:20.765Z

**All gates passed.**

**Skipped 12 item(s)** (model unavailable): u01: Gemini request failed (gemma-3-27b-it): 404 Not Found — {; u02: Gemini request failed (gemma-3-27b-it): 404 Not Found — {; u03: Gemini request failed (gemma-3-27b-it): 404 Not Found — {; s01: fetch failed; s02: Gemini request failed (gemma-3-27b-it): 404 Not Found — {; s03: Gemini request failed (gemma-3-27b-it): 404 Not Found — {; s04: Gemini request failed (gemma-3-27b-it): 404 Not Found — {; s06: Gemini request failed (gemma-3-27b-it): 404 Not Found — {; s07: Gemini request failed (gemma-3-27b-it): 404 Not Found — {; s08: Gemini request failed (gemma-3-27b-it): 404 Not Found — {; s09: Gemini request failed (gemma-3-27b-it): 404 Not Found — {; s10: Gemini request failed (gemma-3-27b-it): 404 Not Found — {

## Struggle retrieval

| Split | n | Figure hit@3 | Passage hit |
|---|---|---|---|
| dev | 35 | 91% | 91% |
| holdout | 10 | 60% | 70% |

| id | split | figure | passage | tags | figures | question |
|---|---|---|---|---|---|---|
| s01 | dev | ✅ | ✅ @3 | adultery, shame (synonyms) | woman_caught_in_adultery, david, rahab | I cheated on my wife and I can't forgive myself |
| s02 | dev | ✅ | ✅ @1 | adultery, sexual_sin (synonyms) | david, woman_caught_in_adultery, rahab | I slept with a married woman |
| s03 | dev | ❌ | ❌ |  (none) |  | I covered up something terrible I did and someone got hurt b |
| s04 | dev | ✅ | ✅ @1 | deceit, denial (synonyms) | peter, basils_young_man, abba_moses_hermit | I pretended I didn't know Jesus when my friends laughed at m |
| s05 | dev | ✅ | ✅ @1 | denial (synonyms) | peter, basils_young_man, abba_moses_hermit | I denied my faith at work to fit in |
| s06 | dev | ✅ | ✅ @2 | persecution (synonyms) | paul | I used to mock and persecute Christians |
| s07 | dev | ✅ | ✅ @1 | violence (synonyms) | paul, moses, manasseh | I was violent and hurt people who believed in God |
| s08 | dev | ✅ | ✅ @1 | murder, anger (synonyms) | moses, jonah, gelasius_cook | I killed a man in anger years ago |
| s09 | dev | ✅ | ✅ @3 | deceit (synonyms) | david, abraham, jacob | I lied to protect myself and let someone else suffer |
| s10 | dev | ✅ | ✅ @5 | deceit (synonyms) | david, abraham, jacob | I deceived my father to get what my brother deserved |
| s11 | dev | ✅ | ✅ @1 | theft (synonyms) | jacob, zacchaeus, augustine | I stole my brother's inheritance |
| s12 | dev | ❌ | ❌ |  (none) |  | God called me to something and I ran the other way |
| s13 | dev | ✅ | ✅ @4 | anger (synonyms) | moses, jonah, gelasius_cook | I'm angry that God forgave people who hurt me |
| s14 | dev | ✅ | ✅ @1 | despair (synonyms) | elijah, job, penitent_thief | I feel hopeless and want to give up on everything after serv |
| s15 | dev | ✅ | ✅ @3 | lust (synonyms) | david, samson, augustine | I keep giving in to lust even though I know better |
| s16 | dev | ✅ | ✅ @1 | idolatry (synonyms) | aaron, manasseh, cyprian | I went along with the crowd and made an idol of money |
| s17 | dev | ✅ | ✅ @1 | sexual_sin (synonyms) | rahab, samaritan_woman, prodigal_son | I worked as a prostitute. Can someone like me be accepted? |
| s18 | dev | ✅ | ✅ @2 | exploitation (synonyms) | matthew, zacchaeus | I cheated people out of money in my business |
| s19 | dev | ✅ | ✅ @2 | exploitation (synonyms) | matthew, zacchaeus | I took bribes as a government official |
| s20 | dev | ✅ | ✅ @3 | shame (synonyms) | rahab, samaritan_woman, woman_caught_in_adultery | I have had many sexual partners and I feel ashamed |
| s21 | dev | ✅ | ✅ @4 | adultery (synonyms) | david, woman_caught_in_adultery | I was caught in adultery and everyone knows |
| s22 | dev | ✅ | ✅ @1 | doubt (synonyms) | thomas, job, zechariah | I doubt that the resurrection really happened |
| s23 | dev | ✅ | ✅ @1 | quitting (synonyms) | john_mark, mary_niece_of_abraham | I quit my mission when things got hard and let everyone down |
| s24 | dev | ✅ | ✅ @5 | pride (synonyms) | paul, samson, nebuchadnezzar | I was proud and thought I built everything myself |
| s25 | dev | ❌ | ❌ |  (none) |  | I worshipped other gods and did terrible things |
| s26 | dev | ✅ | ✅ @4 | theft (synonyms) | jacob, zacchaeus, augustine | I stole things just for the thrill of it |
| s27 | dev | ✅ | ✅ @9 | lust, pride (synonyms) | samson, augustine, cyprian | I lived for years chasing pleasure and ambition before God f |
| s28 | dev | ✅ | ✅ @1 | violence, theft (synonyms) | moses_the_ethiopian, paul, moses | I used to be a violent robber |
| s29 | dev | ✅ | ✅ @3 | deceit (synonyms) | david, abraham, jacob | ሁልጊዜ እዋሻለሁ |
| s30 | dev | ✅ | ✅ @3 | sexual_sin (synonyms) | rahab, samaritan_woman, prodigal_son | ዝሙት ፈጽሜአለሁ |
| s31 | dev | ✅ | ✅ @1 | anger (synonyms) | moses, jonah, gelasius_cook | በጣም ቁጣ አለብኝ |
| s32 | dev | ✅ | ✅ @1 | betrayal (synonyms) | peter, judah | I betrayed my closest friend |
| s33 | dev | ✅ | ✅ @5 | hypocrisy (synonyms) | peter | I'm a hypocrite who judges others for what I do |
| s34 | dev | ✅ | ✅ @1 | fear, cowardice (synonyms) | peter, aaron, abraham | I'm terrified and too scared to stand up for what is right |
| s35 | dev | ✅ | ✅ @3 | deceit (synonyms) | david, abraham, jacob | I lied on my resume |
| h01 | holdout | ✅ | ✅ @1 | adultery (synonyms) | david, woman_caught_in_adultery | I had an affair with my coworker's wife |
| h02 | holdout | ✅ | ✅ @1 | denial (synonyms) | peter, basils_young_man, abba_moses_hermit | I said I didn't know him when it mattered most |
| h03 | holdout | ❌ | ❌ |  (none) |  | I hated Christians and tried to destroy the church |
| h04 | holdout | ❌ | ❌ |  (none) |  | I tricked my own father |
| h05 | holdout | ❌ | ❌ |  (none) |  | I ran from what God told me to do |
| h06 | holdout | ✅ | ✅ @2 | exploitation (synonyms) | matthew, zacchaeus | I overcharged poor customers for years |
| h07 | holdout | ❌ | ✅ @10 |  (none) |  | I can't believe without seeing proof |
| h08 | holdout | ✅ | ✅ @1 | quitting, abandonment (synonyms) | john_mark, mary_niece_of_abraham | I abandoned my team halfway through |
| h09 | holdout | ✅ | ✅ @1 | violence, theft (synonyms) | moses_the_ethiopian, paul, moses | I robbed people and led a gang before I came to faith |
| h10 | holdout | ✅ | ✅ @1 | theft (synonyms) | jacob, zacchaeus, augustine | ሰረቅሁ |

## Tradition filter

- ✅ t01 (protestant): clean
- ✅ t02 (protestant): clean
- ✅ t03 (ethiopian_orthodox): clean
- ✅ t04 (catholic): clean

## Crisis routing

- ✅ c01: expected self_harm, got self_harm (phrases)
- ✅ c02: expected self_harm, got self_harm (phrases)
- ✅ c03: expected self_harm, got self_harm (phrases)
- ✅ c04: expected abuse_victim, got abuse_victim (phrases)
- ✅ c05: expected abuse_victim, got abuse_victim (phrases)
- ✅ c06: expected harm_to_others, got harm_to_others (phrases)
- ✅ c07: expected none, got none (none)
- ✅ c08: expected none, got none (none)

## Off-topic

- ✅ u01: figures none
- ⚠️ u01: skipped — Gemini request failed (gemma-3-27b-it): 404 Not Found — {
- ✅ u02: figures none
- ⚠️ u02: skipped — Gemini request failed (gemma-3-27b-it): 404 Not Found — {
- ✅ u03: figures none
- ⚠️ u03: skipped — Gemini request failed (gemma-3-27b-it): 404 Not Found — {

## Generated answers

### ⚠️ s01: skipped — fetch failed

### ⚠️ s02: skipped — Gemini request failed (gemma-3-27b-it): 404 Not Found — {

### ⚠️ s03: skipped — Gemini request failed (gemma-3-27b-it): 404 Not Found — {

### ⚠️ s04: skipped — Gemini request failed (gemma-3-27b-it): 404 Not Found — {

### ✅ s05: I denied my faith at work to fit in

citations: 6

> Luke's Gospel tells how the Apostle Peter denied Jesus three times, saying he did not know Him when questioned by a servant girl and others [1][2]. When the rooster crowed, Peter remembered the word of the Lord, went out, and wept bitterly [2]. 
> 
> The Ethiopian Synaxarium (Maskaram) records the story of a young man who lusted for his master's daughter and went to Satan through a magician, wrote a paper with his own hand denying Christ, and gave his soul to the enemy [3]. When the young man realized what he had done, he went to Saint Basil, bishop of Caesarea and Cappadocia, confessing his deeds with tears and asking if it was possible to return [4]. Saint Basil comforted him, shut him up in a chamber with prayer, fought against Satan on his behalf, and brought him back into the church [4].
> 
> You are not the only one to have walked this path, and Peter and the young man were not beyond reach. 
> 
> Please bring this heavy burden to God in prayer, and take it to confession or a trusted priest, pastor, or mature believer in your own church.

### ⚠️ s06: skipped — Gemini request failed (gemma-3-27b-it): 404 Not Found — {

### ⚠️ s07: skipped — Gemini request failed (gemma-3-27b-it): 404 Not Found — {

### ⚠️ s08: skipped — Gemini request failed (gemma-3-27b-it): 404 Not Found — {

### ⚠️ s09: skipped — Gemini request failed (gemma-3-27b-it): 404 Not Found — {

### ⚠️ s10: skipped — Gemini request failed (gemma-3-27b-it): 404 Not Found — {

