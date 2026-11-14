from services.omniroute import generate

LANE_PROMPT = """
Given the following task, classify it into one of three lanes.

Lane 1: Marcus can complete it autonomously right now. Examples: drafting a message, summarising a document, setting a reminder, answering a question, researching a topic.
Lane 2: Requires ECHELON (a team of execution agents). Examples: multi-step operations, running code, complex deployments, anything involving tools Marcus doesn't have.
Lane 3: Victor must decide before anything happens. Examples: committing to an external party, spending money, sharing proprietary material, strategic decisions.

Respond with ONLY: lane1, lane2, or lane3. No explanation.

Task: {task}
"""

async def classify_lane(task_description: str) -> str:
    result = await generate(LANE_PROMPT.format(task=task_description), temperature=0.0)
    result = result.strip().lower()
    if result not in ("lane1", "lane2", "lane3"):
        return "lane3"  # Default to safe
    return result
