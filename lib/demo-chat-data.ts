export interface DemoChatEntry {
  question: string;
  toolCalls: { toolName: string; args: Record<string, unknown> }[];
  answer: string; // Markdown with real ref: links
}

/**
 * Map of collection slug → demo chat entries.
 *
 * To populate for a curated collection:
 * 1. Open the collection's AI pane (library mode) and ask great questions
 * 2. Copy the Q&A from chat_messages in Supabase
 * 3. Paste here keyed by the collection's slug
 *
 * Example entry format:
 * ```
 * "philosophy-classics": [
 *   {
 *     question: "How do Plato and Aristotle differ on the nature of reality?",
 *     toolCalls: [
 *       { toolName: "vector_search", args: { query: "nature of reality forms matter" } },
 *     ],
 *     answer: "Plato argues that true reality exists in the realm of Forms...\n\n[ref:section-uuid?p=87](ref:section-uuid?p=87)"
 *   },
 * ]
 * ```
 */
export const DEMO_DATA: Record<string, DemoChatEntry[]> = {


  "military-strategy": [
    {
      question: "Give examples of how leaders command respect.",
      toolCalls: [
        {
          toolName: "vector_search",
          args: {
            query: "leaders command respect example authority obedience trust honor example leadership respect",
            limit: 8,
            max_per_book: 2
          }
        },
        {
          toolName: "text_search",
          args: {
            query: "respect|honor|obedience|authority",
            limit: 8,
            max_per_book: 2
          }
        }
      ],
      answer: `
### Ways leaders command respect

Leaders usually command respect through a mix of **competence**, **example**, **discipline**, **justice**, and **care for followers**. Your library gives several strong examples.

### 1. **By being seen as wiser and more capable**
In **Xenophon’s _Cyropaedia: The Education of Cyrus_**, Cambyses tells Cyrus that people willingly obey the person they believe understands better than they do.

From **_Cyropaedia_ by Xenophon**:  
["When the interests of mankind are at stake, they will obey with joy the man whom they believe to be wiser than themselves."](ref:5b8eca8c-aa77-4a74-aca0-0f2dfb8627ed?ro=1&pos=86&bid=df7008b1-ab36-40f4-b0d5-dfa3c0c2660c)

**Example:** a leader earns respect by showing **judgment**, **foresight**, and **practical wisdom**, so followers trust the leader’s decisions.

### 2. **By leading through personal example**
In **Machiavelli’s _Discourses on the First Decade of Titus Livius_**, Valerius Corvinus is presented as the sort of commander soldiers trust because he does what he asks others to do.

From **_Discourses on the First Decade of Titus Livius_ by Niccolò Machiavelli**:  
["Soldiers! I would have you follow my deeds and not my words, and look to me for example rather than for commands;"](ref:f1514c03-6e42-483f-a818-9c4bffe82927?ro=134&pos=910&bid=d232e77c-ac5f-4590-9a85-a1af82b8bdc2)

**Example:** leaders gain respect when they **share danger**, **work hard**, and **model the behavior** they demand.

### 3. **By creating willing obedience, not just forcing it**
In **Plutarch’s _Lives of the noble Grecians and Romans_**, the Spartans are praised because their leaders inspired not reluctant compliance but real willingness to follow.

From **_Plutarch: Lives of the noble Grecians and Romans_ by Plutarch**:  
["A true leader himself creates the obedience of his own followers;"](ref:e6a36e61-058d-456c-906f-edd93fba9efa?ro=6&pos=239&bid=50426aee-5eb5-4607-b8c5-ee6e4a028863)

**Example:** respect grows when leadership produces **voluntary loyalty**, not mere fear.

### 4. **By enforcing discipline fairly**
In **Sunzi’s _The Art of War_**, a commander must be humane but also capable of making authority felt.

From **_The Art of War_ by Sunzi**:  
["If, however, you are indulgent, but unable to make your authority felt; kind-hearted, but unable to enforce your commands; and incapable, moreover, of quelling disorder: then your soldiers must be likened to spoilt children;"](ref:dbbe80d9-5568-480e-a681-b45cc434feaf?ro=19&pos=252&bid=fff6ebed-0f55-40b7-afe6-6323b6cdb79d)

**Example:** leaders command respect when they are **firm**, **consistent**, and **do not let disorder slide**.

### 5. **By building pride and personal connection**
In **Sherman’s _Memoirs_**, the colonel is compared to a father who knows his men personally and inspires pride and affection.

From **_Memoirs of General William T. Sherman_ by William T. Sherman**:  
["The colonel, as the father, should have a personal acquaintance with every officer and man, and should instill a feeling of pride and affection for himself,"](ref:6c1039f0-977f-4e37-b518-aa184d74ed1d?ro=12&pos=1912&bid=b4f18677-8a2a-4fc3-8759-41439fb68eb1)

**Example:** respect can come from **personal concern**, **mentorship**, and **shared identity**.

### 6. **By maintaining order under pressure**
In **Xenophon’s _Anabasis_**, after the Greek leaders are seized, the army is told that officers must be even more watchful and subordinates more obedient.

From **_Anabasis_ by Xenophon**:  
["Officers and leaders ought to be more vigilant ever than their predecessors; subordinates still more orderly and obedient to those in command now than even they were to those who are gone."](ref:e4e8ae51-2926-4374-85cd-c4a77cd8414b?ro=2&pos=201&bid=107683bb-3e2f-4301-b454-960a29de1060)

**Example:** in crisis, leaders win respect by **staying calm**, **organizing others**, and **preventing confusion**.

### 7. **By showing honor and steadfastness**
In **Clausewitz’s _On War_**, he links great command with a **love of honor** and with firmness of will.

From **_On War_ by Carl von Clausewitz**:  
["Has there ever been a great Commander destitute of the love of honour, or is such a character even conceivable?"](ref:32ed38a2-f40d-4091-9073-f01b9bc6b824?ro=9&pos=182&bid=807af909-1b58-4a74-be64-6cc9845e4923)

**Example:** people respect leaders who show **character**, **resolve**, and a serious sense of **duty**.

### Quick summary

| Way leaders command respect | What it looks like | Book example |
|---|---|---|
| **Competence** | Sound judgment, expertise | Xenophon, _Cyropaedia_ |
| **Personal example** | “Do as I do” leadership | Machiavelli, _Discourses_ |
| **Willing obedience** | Loyalty, not just fear | Plutarch, _Lives_ |
| **Firm discipline** | Enforcing rules fairly | Sunzi, _The Art of War_ |
| **Personal care** | Knowing followers, building pride | Sherman, _Memoirs_ |
| **Calm in crisis** | Order under pressure | Xenophon, _Anabasis_ |
| **Honor and resolve** | Steadfast character | Clausewitz, _On War_ |

### Bottom line

The books suggest that leaders command respect not merely by **rank** or **power**, but by being:

- **competent**
- **courageous**
- **just**
- **disciplined**
- **personally exemplary**
- **worthy of trust**

If you want, I can also give:
- **historical examples from specific leaders** like Caesar, Alexander, Cyrus, or Napoleon, or
- a **modern workplace version** of these same principles.
      `
    }
  ]
};
