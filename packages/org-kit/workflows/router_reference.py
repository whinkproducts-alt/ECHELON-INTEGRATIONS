"""
WHINK vendor-neutral reference router.
This file does not call any AI provider directly. It selects a proposed workforce
and produces an Execution Authorization Request. Execution must be implemented
by a provider adapter only after human approval.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def load_registry():
    agents = json.loads((ROOT/"organization"/"workforce_registry.json").read_text())
    teams = json.loads((ROOT/"organization"/"team_registry.json").read_text())
    return agents, teams

def _cost_rank(profile):
    return {"low":3,"medium":2,"high":1}.get(profile,1)

def score_agent(agent, required_skills, target_directorate=None, target_department=None):
    skills = set(agent.get("skills", []))
    required = set(required_skills)
    overlap = len(skills & required) / max(1, len(required))
    score = overlap * 0.45
    if target_department and agent.get("department") == target_department:
        score += 0.20
    if target_directorate and agent.get("directorate") == target_directorate:
        score += 0.10
    if agent.get("state") == "dormant":
        score += 0.10
    score += (_cost_rank(agent.get("cost_profile"))/3.0)*0.10
    return round(score, 4)

def propose_team(required_skills, target_directorate=None, target_department=None, max_agents=5):
    agents, _ = load_registry()
    scored = [(score_agent(a, required_skills, target_directorate, target_department), a) for a in agents]
    scored.sort(key=lambda x: x[0], reverse=True)

    selected = []
    covered = set()
    for score, a in scored:
        new_coverage = set(a.get("skills", [])) & set(required_skills) - covered
        if not new_coverage:
            continue
        selected.append({"score":score, **a})
        covered |= set(a.get("skills", [])) & set(required_skills)
        if covered >= set(required_skills) or len(selected) >= max_agents:
            break

    return selected, sorted(set(required_skills)-covered)

def build_authorization_request(objective, required_skills, target_directorate=None, target_department=None,
                                schedule="To be estimated by provider/runtime", budget="Requires provider rate card"):
    selected, gaps = propose_team(required_skills, target_directorate, target_department)
    lead = selected[0]["name"] if selected else None
    request = {
        "status":"AWAITING_HUMAN_APPROVAL",
        "objective":objective,
        "lead_agent":lead,
        "supporting_agents":[a["name"] for a in selected[1:]],
        "team_size":len(selected),
        "required_skills":required_skills,
        "capability_gaps":gaps,
        "schedule":schedule,
        "milestones":[],
        "estimated_budget":budget,
        "assumptions":[],
        "risks":[],
        "approval_required":True,
        "execution_allowed":False
    }
    return request

if __name__ == "__main__":
    example = build_authorization_request(
        objective="Example: prepare a cross-functional product launch plan",
        required_skills=["product_strategy","brand_strategy","demand_generation","project_decomposition"]
    )
    print(json.dumps(example, indent=2))
