# Hosting 80 players in 20 Swiss groups

1. Create or edit an **open** tournament. Choose the **Player** event type for individual players, set the player limit to **80**, and select **Swiss**.
2. Enable **Customize format**, then click **Use 4-player Swiss groups → top 2 → knockout**. Apply the preset after setting the player limit.
3. Confirm the stage plan:

   | Setting | Swiss groups | Knockout |
   | --- | --- | --- |
   | Players | 80 | 40 |
   | Groups | 20 | — |
   | Advance | 40 total: top 2 in every group | 1 champion |
   | Rounds | 3 | Automatic |
   | First to | 4 | 4 |
   | Semifinal / final first to | — | 7 |

4. Save the event. Register/check in all **80** players into the joined lineup before drawing pools. Choose **Draw pools**, and verify that each of the 20 pools has exactly 4 players. Existing manual placements are preserved; **Undo draw** clears placements before matches have been generated.
5. Start BEYLIVE. Record results for all pools, then advance the round. Repeat for all 3 Swiss rounds. Players stay within their own pool; later pairings prefer unplayed opponents and similar win records.
6. After the last Swiss round, advance to the knockout stage. The top 2 in each pool qualify. Ranking uses wins, score difference, points scored, fewer losses, seed, then player ID as the final deterministic fallback. Announce the tiebreakers before play. Three rounds with only four players can effectively produce an everyone-plays-everyone schedule; second-place ties are still possible.
7. Rank the 40 qualifiers by **group position → match wins → point difference → points scored**. Exact ties use fewer losses, original seed, then player ID. Group numbers do not affect qualifier seeding. This places all 20 group winners ahead of all 20 runners-up.
8. **Seeds 1–24 receive byes**: all 20 group winners plus the 4 best-performing runners-up. Seeds 25–40 play **8 preliminary matches**. The 8 winners join the 24 bye players in the round of 32, then continue through the round of 16, quarterfinals, semifinals and final. Byes complete automatically. All matches through the quarterfinals are first-to-4; semifinals and final switch automatically to first-to-7.

Performance seeding applies when the knockout bracket is first generated. A bracket that has already been generated keeps its existing seeds and matches.

The preset disables the third-place match and consolation bracket. If a third-place match is wanted, enable it in the knockout stage before starting; it also uses the final's 7-point target.

The preset defaults to 3 Swiss rounds. The host may change this to 2 before the tournament starts, but that leaves two players at 1–1 in each four-player pool and uses the tiebreakers to select second place. Do not add extra custom stages for the semifinal and final: use the knockout stage's dedicated score setting.

Validation: `npm run test:swiss` runs the actual migration functions in an isolated PostgreSQL-compatible database and simulates the full 80-player event. `npm run build` checks the production app build and TypeScript.
