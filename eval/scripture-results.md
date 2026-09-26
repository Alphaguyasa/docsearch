# Scripture eval

Run 2026-09-26T11:21:10.890Z

**Gates failed:** tradition t03: missing figure moses_the_ethiopian; generation s04

## Struggle retrieval

| Split | n | Figure hit@3 | Passage hit |
|---|---|---|---|
| dev | 35 | 91% | 94% |
| holdout | 10 | 100% | 100% |

| id | split | figure | passage | tags | figures | question |
|---|---|---|---|---|---|---|
| s01 | dev | ✅ | ✅ @1 | adultery, resentment (synonyms) | david, jonah, woman_caught_in_adultery | I cheated on my wife and I can't forgive myself |
| s02 | dev | ❌ | ❌ | sexual_sin (synonyms) | rahab, samaritan_woman | I slept with a married woman |
| s03 | dev | ✅ | ✅ @3 | deceit, cowardice, shame (llm) | aaron, david, peter | I covered up something terrible I did and someone got hurt b |
| s04 | dev | ❌ | ❌ | deceit (synonyms) | david, abraham, jacob | I pretended I didn't know Jesus when my friends laughed at m |
| s05 | dev | ✅ | ✅ @1 | denial (synonyms) | peter | I denied my faith at work to fit in |
| s06 | dev | ✅ | ✅ @2 | persecution (synonyms) | paul | I used to mock and persecute Christians |
| s07 | dev | ✅ | ✅ @1 | violence (synonyms) | paul, moses, manasseh | I was violent and hurt people who believed in God |
| s08 | dev | ✅ | ✅ @1 | murder, anger (synonyms) | moses, david, jonah | I killed a man in anger years ago |
| s09 | dev | ✅ | ✅ @3 | deceit (synonyms) | david, abraham, jacob | I lied to protect myself and let someone else suffer |
| s10 | dev | ✅ | ✅ @5 | deceit (synonyms) | david, abraham, jacob | I deceived my father to get what my brother deserved |
| s11 | dev | ✅ | ✅ @1 | theft (synonyms) | jacob, zacchaeus, augustine | I stole my brother's inheritance |
| s12 | dev | ✅ | ✅ @3 | disobedience, fear, quitting (llm) | abraham, jonah, elijah | God called me to something and I ran the other way |
| s13 | dev | ✅ | ✅ @5 | anger (synonyms) | moses, jonah | I'm angry that God forgave people who hurt me |
| s14 | dev | ✅ | ✅ @1 | despair (synonyms) | elijah | I feel hopeless and want to give up on everything after serv |
| s15 | dev | ✅ | ✅ @3 | lust (synonyms) | david, samson, augustine | I keep giving in to lust even though I know better |
| s16 | dev | ✅ | ✅ @1 | idolatry (synonyms) | aaron, manasseh | I went along with the crowd and made an idol of money |
| s17 | dev | ✅ | ✅ @1 | sexual_sin (synonyms) | rahab, samaritan_woman | I worked as a prostitute. Can someone like me be accepted? |
| s18 | dev | ✅ | ✅ @2 | exploitation (synonyms) | matthew, zacchaeus | I cheated people out of money in my business |
| s19 | dev | ✅ | ✅ @2 | exploitation (synonyms) | matthew, zacchaeus | I took bribes as a government official |
| s20 | dev | ✅ | ✅ @3 | shame (synonyms) | rahab, samaritan_woman, woman_caught_in_adultery | I have had many sexual partners and I feel ashamed |
| s21 | dev | ✅ | ✅ @4 | adultery (synonyms) | david, woman_caught_in_adultery | I was caught in adultery and everyone knows |
| s22 | dev | ✅ | ✅ @1 | doubt (synonyms) | thomas | I doubt that the resurrection really happened |
| s23 | dev | ✅ | ✅ @1 | quitting (synonyms) | john_mark | I quit my mission when things got hard and let everyone down |
| s24 | dev | ✅ | ✅ @5 | pride (synonyms) | paul, samson, nebuchadnezzar | I was proud and thought I built everything myself |
| s25 | dev | ✅ | ✅ @4 | idolatry (llm) | aaron, manasseh | I worshipped other gods and did terrible things |
| s26 | dev | ✅ | ✅ @4 | theft (synonyms) | jacob, zacchaeus, augustine | I stole things just for the thrill of it |
| s27 | dev | ❌ | ✅ @3 |  (none) |  | I lived for years chasing pleasure and ambition before God f |
| s28 | dev | ✅ | ✅ @8 | violence (synonyms) | paul, moses, manasseh | I used to be a violent robber |
| s29 | dev | ✅ | ✅ @3 | deceit (synonyms) | david, abraham, jacob | ሁልጊዜ እዋሻለሁ |
| s30 | dev | ✅ | ✅ @4 | sexual_sin (synonyms) | rahab, samaritan_woman | ዝሙት ፈጽሜአለሁ |
| s31 | dev | ✅ | ✅ @1 | anger (synonyms) | moses, jonah | በጣም ቁጣ አለብኝ |
| s32 | dev | ✅ | ✅ @1 | betrayal (synonyms) | peter | I betrayed my closest friend |
| s33 | dev | ✅ | ✅ @5 | hypocrisy (synonyms) | peter | I'm a hypocrite who judges others for what I do |
| s34 | dev | ✅ | ✅ @1 | fear, cowardice (synonyms) | peter, abraham, elijah | I'm terrified and too scared to stand up for what is right |
| s35 | dev | ✅ | ✅ @3 | deceit (synonyms) | david, abraham, jacob | I lied on my resume |
| h01 | holdout | ✅ | ✅ @1 | adultery (synonyms) | david, woman_caught_in_adultery | I had an affair with my coworker's wife |
| h02 | holdout | ✅ | ✅ @1 | cowardice, fear (llm) | peter, abraham, elijah | I said I didn't know him when it mattered most |
| h03 | holdout | ✅ | ✅ @1 | persecution, anger, violence (llm) | paul, moses, jonah | I hated Christians and tried to destroy the church |
| h04 | holdout | ✅ | ✅ @5 | deceit (llm) | david, abraham, jacob | I tricked my own father |
| h05 | holdout | ✅ | ✅ @3 | disobedience, fear, quitting (llm) | abraham, jonah, elijah | I ran from what God told me to do |
| h06 | holdout | ✅ | ✅ @2 | exploitation (synonyms) | matthew, zacchaeus | I overcharged poor customers for years |
| h07 | holdout | ✅ | ✅ @1 | doubt (llm) | thomas | I can't believe without seeing proof |
| h08 | holdout | ✅ | ✅ @1 | quitting, abandonment (synonyms) | john_mark | I abandoned my team halfway through |
| h09 | holdout | ✅ | ✅ @1 | theft, violence (llm) | moses_the_ethiopian, paul, moses | I robbed people and led a gang before I came to faith |
| h10 | holdout | ✅ | ✅ @1 | theft (synonyms) | jacob, zacchaeus, augustine | ሰረቅሁ |

## Tradition filter

- ✅ t01 (protestant): clean
- ✅ t02 (protestant): clean
- ❌ t03 (ethiopian_orthodox): missing figure moses_the_ethiopian
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
  - answer refused ✅
- ✅ u02: figures none
  - answer refused ✅
- ✅ u03: figures none
  - answer refused ✅

## Generated answers

### ✅ s01: I cheated on my wife and I can't forgive myself

citations: 5

> King David saw Bathsheba, the wife of Uriah the Hittite, from his roof, brought her to himself, and lay with her [1][2]. When she conceived, David tried to cover his actions by having Uriah made drunk and eventually writing a letter to Joab to have Uriah sent to the forefront of the hottest battle so that he would die [2]. 
> 
> Church tradition records in the Confessions of Saint Augustine that he committed fornication, ignored his mother's warnings not to defile another man's wife, and took pleasure not only in the deed but in the praise of others, boasting of his flagitiousness [7]. Augustine later confessed these heinous deeds and thanked God for forgiving him, describing how God melted away his sins like ice and cured him as a physician [9].
> 
> You are not the only one to struggle with these heavy burdens, and these individuals were not beyond reach. Please bring this matter to God in prayer, and seek confession or speak with a trusted priest, pastor, or mature believer in your own church.

### ✅ s02: I slept with a married woman

citations: 1

> Church tradition records the story of a person who faced the temptation of unchastity and cried out in distress over the evil that had come upon them, fighting mightily against sin and taking up a sword in struggle [8].
> 
> You are not the only one to struggle with these paths, and these people were not beyond reach. Please bring this to God in prayer, and to confession or a trusted priest, pastor or mature believer in your own church.

### ✅ s03: I covered up something terrible I did and someone got hurt because of it

citations: 6

> King David walked on the roof of his house, saw Bathsheba the wife of Uriah the Hittite, and lay with her [3][4]. When she became pregnant, David attempted to cover up his actions by bringing Uriah home from war, and when Uriah refused to go down to his house, David made him drunk and then wrote a letter to Joab instructing him to send Uriah to the forefront of the hottest battle so that he would be struck and die [4]. 
> 
> Peter followed Jesus to the high priest's house, and when a servant girl and others accused him of being with Jesus, Peter denied it three times, saying he did not know Him [5][6]. When a rooster crowed, the Lord turned and looked at Peter, and Peter remembered the Lord's word, went out, and wept bitterly [6]. 
> 
> You are not the only one to have walked this difficult road, and these people were not beyond reach. Please bring this to God in prayer and to confession or a trusted priest, pastor or mature believer in your own church.

### ❌ s04: I pretended I didn't know Jesus when my friends laughed at me

citations: 0

> This question is not covered by these documents.

### ✅ s05: I denied my faith at work to fit in

citations: 8

> The apostle Peter denied Jesus when he was recognized as one of His followers [1][2]. When questioned by a servant girl and others, Peter denied Jesus multiple times, saying he did not know Him and did not know what they were talking about [1][2]. After a rooster crowed and the Lord looked at him, Peter remembered Jesus' words, went out, and wept bitterly [2]. Later, Jesus restored Peter, asking him three times if he loved Him and giving him instructions to feed His sheep [3][4]. Church tradition also records that Peter later acted in hypocrisy by separating himself from Gentiles out of fear of the circumcision party, for which Paul resisted him to his face [5].
> 
> You are not the only one who has faced this struggle, and Peter was not beyond reach. Please bring this to God in prayer, and to confession or a trusted priest, pastor, or mature believer in your own church.

### ✅ s06: I used to mock and persecute Christians

citations: 13

> Paul, formerly known as Saul, was a persecutor and blasphemer who ravaged the assembly, entering houses and dragging men and women off to prison [1][3][5]. He consented to the death of Stephen and breathed threats and slaughter against the disciples of the Lord, going to the high priest for letters to bind those of the Way [1][2][3]. When a light from the sky shone around him on the road to Damascus, he heard the voice of Jesus asking why he persecuted Him [2][3]. He was led into Damascus blind for three days, during which he neither ate nor drank [3]. Through Ananias, sent by the Lord, his sight was restored, he was filled with the Holy Spirit, and he was baptized [3][4]. He then immediately proclaimed Christ in the synagogues and preached boldly in the name of Jesus [4][5].
> 
> You are not the only one who has lived this way, and these people were not beyond reach. 
> 
> Please bring this to God in prayer and to confession or a trusted priest, pastor or mature believer in your own church.

### ✅ s07: I was violent and hurt people who believed in God

citations: 5

> Moses grew up and saw an Egyptian striking a Hebrew, and after looking this way and that, he killed the Egyptian and hid him in the sand [3]. When Pharaoh sought to kill him for this deed, Moses fled and lived in the land of Midian [3]. 
> 
> Saul consented to the death of Stephen, and later ravaged the assembly of believers, entering every house and dragging both men and women off to prison while breathing threats and slaughter against the disciples [1][2]. As Saul traveled near Damascus, a light from the sky shone around him, he fell to the earth, and he heard a voice asking him why he persecuted Him [2].
> 
> You are not the only one who has known such things, and these people were not beyond reach. Please bring this to God in prayer and to confession or a trusted priest, pastor or mature believer in your own church.

### ✅ s08: I killed a man in anger years ago

citations: 3

> The Church tradition records the story of a young man who loved a woman serving in a tavern and, when she refused his demand to remain pure, took a sword and killed her [7]. When his hands withered and he was confronted by the apostle Thomas, he did not hide what he had done, confessing that he had done an abominable thing and letting anger make him commit the act [7]. He bowed down at the apostle's feet, was told to wash his hands in water prayed over by the apostle, and led the apostle to the dead body, where he participated in calling upon Christ to raise her [7].
> 
> You are not the only one carrying such a burden, and this person was not beyond reach. Please bring this to God in prayer, and bring it to confession or a trusted priest, pastor, or mature believer in your own church.

### ✅ s09: I lied to protect myself and let someone else suffer

citations: 2

> Church tradition records the account of Abraham, who lied by saying his wife Sarah was his sister to protect himself, which led to Pharaoh taking her into his house and Pharaoh and his house being afflicted with great plagues [3]. Abraham did so again later with Abimelech, saying Sarah was his sister, which brought a great sin and danger upon Abimelech and his kingdom until Abraham was told to restore her so that he might pray for them [4]. 
> 
> You are not the only one to have fallen in this way, and these people were not beyond reach. Please bring this burden to God in prayer, and bring it to confession or to a trusted priest, pastor, or mature believer in your own church.

### ✅ s10: I deceived my father to get what my brother deserved

citations: 4

> The documents tell the story of Jacob, who listened to his mother Rebekah when she commanded him to get two young goats so she could make savory food for his father Isaac, instructing Jacob to take it to his father so that Isaac might bless him before his death [6]. When Jacob expressed fear that his father would touch him and realize he was smooth while his brother Esau was a hairy man—bringing a curse instead of a blessing—his mother told him to let the curse be on her and only obey her voice [6]. Jacob brought the goats, and Rebekah put the clothes of Esau on Jacob, placed the skins of the young goats on his hands and the smooth of his neck, and gave him the food and bread to take to his father [6]. Through this deception, Jacob took away his brother's blessing, leading Esau to cry with an exceedingly great and bitter cry when he discovered what had happened [10]. 
> 
> You are not the one who struggles alone; these people were not beyond reach. Please bring this to God in prayer and to confession or a trusted priest, pastor or mature believer in your own church.

