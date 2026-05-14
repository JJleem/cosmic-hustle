from pydantic import BaseModel, Field


class PlanResult(BaseModel):
    task_type: str = "research"
    objective: str = ""
    scope: str = ""
    output_format: str = "리포트"
    needs_clarification: bool = False
    clarify_questions: list[str] = Field(default_factory=list)
    plan_note: str = ""
    resolved_task_type: str = ""  # set by pipeline after validation


class WikiResult(BaseModel):
    context: str = ""
    keywords: list[str] = Field(default_factory=list)
    wiki_pages_found: list = Field(default_factory=list)


class PockeResult(BaseModel):
    sources: list[dict] = Field(default_factory=list)
    key_facts: list[str] = Field(default_factory=list)


class Insight(BaseModel):
    title: str = ""
    description: str = ""


class KaResult(BaseModel):
    insights: list[Insight] = Field(default_factory=list)
    conclusion: str = ""
    data_quality: str = "medium"


class FactResult(BaseModel):
    passed: bool = True
    issues: list = Field(default_factory=list)
    feedback: str = ""
    needs_research: bool = False
    research_queries: list[str] = Field(default_factory=list)


class PingIdea(BaseModel):
    title: str = ""
    spark: str = ""


class PingResult(BaseModel):
    ideas: list[PingIdea] = Field(default_factory=list)
