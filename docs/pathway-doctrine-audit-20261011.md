# Doctrine audit: public Pathway explanations
Date: 2026-10-11
Scope: `src/pathway-catalog.ts`, the 20 website Pathways and their 106 **What This Shows** explanations.
Status: **Owner-approved for production publication on 2026-10-11; verify production deployment separately.**

The 52 rewrites below are the second doctrine-focused pass on the previously expanded catalog. The combined publication from the earlier production catalog changes 102 explanation entries in total, including the earlier depth pass; one existing next-question transition was shortened in that depth pass.

## Doctrinal baseline

The Pathways present a biblical Apostolic Oneness reading of Scripture:
- Scripture confesses one LORD, one Creator, and one Savior (Deuteronomy 6:4; Isaiah 44:24; 1 Corinthians 8:4).
- The Word **was God** and was made flesh (John 1:1, 14). It must never sound as though a created Word merely obtained a portion of divinity.
- Jesus Christ truly shares our humanity while all the fullness of the Godhead dwells in Him bodily (Colossians 2:9; Luke 2:52; Hebrews 5:7–8). Neither truth may cancel the other.
- The Father is genuinely revealed and active in the incarnate Son (John 14:9–10), without treating the Son's prayers and obedience as staged.
- Apostolic preaching joins repentance, baptism in Jesus' name, and receiving the Holy Ghost to the gospel (Acts 2:38); it does not teach that a ritual or a human work purchases salvation (Ephesians 2:8–10).
- Acts repeatedly records tongues at Spirit reception. The Apostolic doctrine of initial evidence is drawn from the pattern; 1 Corinthians 12:30 must be read in its setting of gifts in the congregation.

## Editorial discipline

1. **What the verse says:** Identify the speaker, assertion, and immediate setting. Preserve exact KJV wording and references.
2. **What Apostolic Oneness concludes:** Make the church's understanding explicit and affirmative. When the conclusion requires connecting several texts, say so.
3. **What the verse does not settle alone:** Do not attribute later technical categories or disputed conclusions directly to the verse.
4. **Who holds what:** Trinitarian doctrine also affirms **one God**, not two competing gods. Present the actual disputed issue as the relationship of Father, Son, and Spirit within the one divine identity. Do not caricature other Christian views.
5. **God and humanity:** Never portray Jesus as a merely human prophet endowed with a fraction of deity; never minimize His real birth, growth, suffering, will, prayer, and death.
6. **Word and Son:** Preserve both statements of John 1:1 (Word with God; Word was God) and its fulfillment in 1:14. Luke 1:35 directly explains a birth announcement; debating eternal Sonship requires the wider canon.
7. **Baptism:** Matthew 28:19 uses singular *name*, but that grammar alone does not spell out the name. Use the apostolic descriptions in Acts when teaching baptism in Jesus' name.
8. **Spirit and tongues:** John 14 says both *another Comforter* and *I will come to you*. Do not suppress either. Explain Acts' recorded manifestations and distinguish them from the public gifts of 1 Corinthians 12.
9. **Right hand:** The image includes power, honor, and royal exaltation in different passages; Psalm 110's speaker and enthroned figure are not to be erased. Apostolic interpretation connects the scene to Jesus' genuine messianic exaltation.
10. **Salvation:** Grace is God's gift; believing obedience responds to it, not a wage that earns it.

## Every Pathway reviewed

| Pathway | Steps | Explanations rewritten | Review emphasis |
| --- | ---: | ---: | --- |
| God Is One | 5 | 1 | One God; read 1 Corinthians 8:4 with verse 6 |
| No God Beside Him | 5 | 1 | Avoid the strawman that Trinitarians teach two gods |
| God Alone Is Creator | 5 | 3 | John's Word is uncreated; Psalm 33 background; Colossians 1 |
| Jesus Is God | 6 | 6 | Isaiah 9:6; Emmanuel; John 1:1; Colossians 2:9; Thomas |
| The Word Became Flesh | 5 | 3 | Word *was* God, not a created bearer of deity |
| The Son Was Born | 5 | 3 | Real birth; avoid using Luke 1:35 alone to settle eternal Sonship |
| The Father Dwells in the Son | 5 | 3 | John 14:9–10 and genuine indwelling |
| Jesus Is the Image of God | 5 | 3 | The invisible God revealed; Colossians 1; Hebrews 1 |
| The Fullness of the Godhead | 5 | 2 | Full deity in bodily Christ; genuine humanity |
| The Name of Jesus | 5 | 2 | Name as saving identity; John 17:6 and Philippians 2 |
| Matthew 28:19 and Acts 2:38 | 5 | 3 | Singular name does not independently settle the formula |
| Baptism in Jesus' Name | 6 | 2 | Apostolic practice; Spirit preceding water in Acts 10 |
| The New Birth | 6 | 3 | John 3 water and Spirit read alongside Acts |
| Repentance | 5 | 0 | Existing explanation sound; mercy and genuine change retained |
| Receiving the Holy Ghost | 6 | 3 | The Comforter and observable infilling |
| Tongues as the Initial Sign | 6 | 5 | Repeated Acts pattern; public gifts in 1 Corinthians 12 |
| The Gospel Pattern | 5 | 1 | Gospel and response without inventing a direct three-part verse |
| Faith, Grace, and Obedience | 5 | 1 | Grace and obedient response are not competing sources of merit |
| The Right Hand of God | 5 | 4 | Messianic kingship, exaltation, and mediatorial reign |
| Jesus' Prayers and Humanity | 6 | 3 | Real human prayer without a second god or staged conversation |
| **Total** | **106** | **52** | **54 examined and retained** |

## Change boundary and checks

- This specific doctrine audit revises only explanatory paragraphs. The combined production content release changes **102 explanation entries** and shortens **one** final next-question transition, while keeping all 20 slugs and 106 step titles and Scripture references unchanged.
- Full KJV text, red emphasis, study controls, and the existing Teleprompter are untouched.
- Confirm all referenced KJV passages resolve, all explanations remain readable, and the final exact-SHA preview passes `npm test`, `npm run typecheck`, and `npm run build`. The separate in-progress integration branch includes the weekly Content Engine and must verify its **20-frame-per-post** limit before that engine is released; the current production branch does not include it.
- This content-only publication is based directly on production `main`, and does not merge the pending `integration/ag-unified-20261006` release. No migration, publishing automation, or database write is part of this task.
- The repository owner explicitly approved the public doctrine revision for `main` on 2026-10-11. Automated tests verify structure and specific stated distinctions, not theological truth or independent church endorsement.
