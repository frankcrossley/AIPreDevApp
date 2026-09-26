# PRFAQ (draft)

> **Draft for Frank to rewrite.** Assembled from our design conversations. Every judgment call here should be yours. When it's done, run your own read-back: ask two people to explain it in one line and see whether they match.

## Headline

Product teams stop spending weeks working out what to build: one workspace turns raw input into backlog items that are the right thing and ready to build.

## Subhead

Discovery calls, surveys, tickets and team notes go in. Items come out challenged, agreed by the right people, traced to evidence and synced to Jira as Ready. The team writes; an AI teammate reshapes, challenges and runs the process, and never invents anything.

## The problem

AI has made building fast. The slow, expensive part is now everything before it: gathering input, getting stakeholders to agree, turning notes into criteria, and finding out mid-sprint that the team never agreed what it was building. Refinement sessions run long because items arrive half-formed. Decisions live in people's heads, Slack threads and last quarter's Confluence page. Coding agents amplify whatever the spec gets wrong.

## What changes

- **One workspace.** The backlog on the left, a notebook for each item in the middle, and everything that needs you on the right: decisions, talking points, discovery themes.
- **Two checks on every item.** *Right thing* is anchored to the epic's PRFAQ and the team's read-backs. *Built right* is the team's Definition of Ready, with a floor nobody can remove.
- **A lifecycle nobody can skip.** Draft, triaged, in refinement, agreed, Ready. Content added outside a session is a time-bound draft until the lead accepts it.
- **An AI teammate with hats.** The Scrum Master runs agendas, expiry and the Ready check. The QA, Architect, Engineer, Security and Product hats challenge the content in context. It reshapes notes into your format, and every line links back to its source.
- **Enforcement where it bites.** Items sync to Jira, and a sprint can't take an item that isn't Ready.

## Who it's for

- Scaling product teams, roughly 20 to 100 engineers, where context no longer fits in one head.
- PMOs and delivery leads accountable for the time from business case to first sprint.
- Agencies and consultancies whose margin disappears in discovery.

## How we'll know it worked (for design partners)

- Refinement sessions get shorter, because most items arrive two or three checks from Ready.
- Fewer clarification questions during the build, from people and from coding agents.
- Fewer decisions reopened after items enter a sprint.
- The team is still using it after week four.

*Set baselines with each design partner before they start.*

## Customer FAQ

**Is this another place to write docs?**
It replaces the requirements page, the decision log and the RAID spreadsheet. The logs are views of what the team already wrote.

**Does the AI write our requirements?**
No. It reshapes what people wrote into the team's format, links every line to its source, and raises questions. Anything it can't source is shown as unconfirmed.

**Do we have to change how we run refinement?**
No. It keeps the rituals you already run, and makes the session shorter by doing the chasing beforehand.

**Does it replace Jira?**
No. Jira keeps delivery. This keeps intent: notes, decisions, sources and who agreed.

## Internal FAQ

**Why won't Notion or Confluence just add this?**
*Your answer here.* A starting point: the editor isn't the product. The lifecycle, the computed checks, the source-linked shaping and the Jira enforcement are.

**What stops teams turning off the rules?**
The floor checks can't be removed. Teams can only add their own.

**What's the riskiest assumption?**
*Your answer here.* Candidates: teams accept being blocked by the Ready check, and the AI's shaping is trustworthy enough that people stop rewriting it.

**Why would a team pay for this?**
*Your answer here.*
