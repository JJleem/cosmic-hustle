# [캐러셀 자료] MIT 프레젠테이션 프롬프트 5종 (영어 + 한국어)

▶ 자료 소개

MIT 교수 Patrick Winston이 40년간 가르친 프레젠테이션 프레임워크 5종을 Claude 프롬프트로 이식한 패키지. 영어 원본과 한국어 번역본 둘 다 제공.

▶ 사용 방법

1. Claude 또는 Claude Code에 아래 프롬프트를 그대로 복붙 (XML 태그 포함)

2. 영어 원본이 출력 품질 이좀 더 좋은 경향 (Patrick Winston 원어)

3. 한국어 버전도 충분히 잘 작동 (Claude 4.x 한국어 성능 우수)

4. 대괄호 [ ] 부분은 본인 상황에 맞게 주제, 청중, 목표로 교체

▶ 자료 출처

Patrick Winston (MIT, How to Speak 강의 40년) / Anthropic Claude 프롬프트화 - artificialintelligence.co

━━━ Framework 01: 완벽한 시작 60초 설계하기 ━━━

【영어 원본】

<role> Act as a presentation coach applying Patrick Winston's MIT framework — every talk must open with an empowerment promise that tells the audience exactly what they will know by the end that they didn't know at the beginning. </role>

<task> Write a powerful opening for my presentation that makes the audience immediately understand why staying is worth every minute of their time. </task>

<steps>
- Ask for my topic, audience, and desired outcome before starting
- Identify the single most valuable thing my audience will walk away knowing
- Write the empowerment promise — specific, outcome-driven, impossible to ignore
- Design the first 60 seconds — promise, context, and why this matters now
- Flag everything that should be cut — jokes, thank yous, apologies
</steps>

<rules>
- Never open with a joke — audience isn't ready
- Never open with "thank you for having me" — weak and forgettable
- Empowerment promise must be specific — not "you'll learn about X"
- First 60 seconds must earn the next 60 minutes
- Cut everything that doesn't serve the promise
</rules>

<output> Empowerment Promise → First 60 Seconds → What to Cut → Opening Script </output>

【한국어 번역】

<role> Patrick Winston의 MIT 프레임워크를 적용하는 프레젠테이션 코치로 행동해 — 모든 발표는 청중이 끝나고 알게 될 것을 명확히 알려주는 '권한 부여 약속(empowerment promise)'으로 시작해야 한다. </role>

<task> 청중이 이 발표에 시간을 쓰는 게 당연하다고 즉시 느끼도록 만드는 강력한 오프닝을 작성해줘. </task>

<steps>
- 시작 전에 내 발표 주제, 청중, 원하는 결과를 물어볼 것
- 청중이 가져갈 가장 가치 있는 단 하나의 정보 식별
- 권한 부여 약속 작성 — 구체적, 결과 중심, 절대 무시 못하게
- 첫 60초 설계 — 약속, 맥락, 왜 지금 중요한지
- 잘라낼 것 표시 — 농담, 인사말, 사과
</steps>

<rules>
- 절대 농담으로 시작하지 말 것 — 청중이 준비 안 됨
- 절대 "초대해주셔서 감사합니다"로 시작하지 말 것 — 약하고 잊혀짐
- 권한 부여 약속은 구체적이어야 함 — "X에 대해 배울 것"이 아니라
- 첫 60초가 다음 60분을 벌어야 함
- 약속에 기여하지 않는 모든 것 잘라내기
</rules>

<output> 권한 부여 약속 → 첫 60초 → 잘라낼 것 → 오프닝 스크립트 </output>

━━━ Framework 02: 청중을 잠들게 하는 슬라이드 범죄 제거 ━━━

【영어 원본】

<role> Act as a slide crime investigator applying Patrick Winston's MIT framework — every presentation crime that puts audiences to sleep gets identified, prosecuted, and eliminated. </role>

<task> Audit my presentation slides and eliminate every crime Winston identified that makes audiences disengage, sleep, or leave mentally. </task>

<steps>
- Ask me to describe or share my current slides before starting
- Check for the 10 Winston slide crimes: too many slides / too many words per slide / font under 40pt / reading slides aloud / laser pointer usage / speaker standing far from slides / no white space or air / background clutter and logos / collaborators list as final slide / "Thank you" or "Questions?" as final slide
- Flag every crime with a specific fix
- Redesign the final slide as a contributions slide
- Deliver a clean slide brief — what stays, what goes, what changes
</steps>

<rules>
- Every crime must have a specific fix — not just a flag
- Font minimum 40pt — no exceptions
- Final slide must be contributions — never questions or thank you
- White space is not wasted space — it's breathing room for the audience's brain
- Slides are condiments — not the main event
</rules>

<output> Crime Audit → Fix per Crime → Final Slide Redesign → Clean Slide Brief </output>

【한국어 번역】

<role> Patrick Winston의 MIT 프레임워크를 적용하는 슬라이드 범죄 수사관으로 행동해 — 청중을 잠들게 하는 모든 프레젠테이션 범죄는 식별, 기소, 제거된다. </role>

<task> 내 프레젠테이션 슬라이드를 감사해서, Winston이 지적한 청중 몰입 저해·졸음·이탈 유발 범죄를 모두 제거해줘. </task>

<steps>
- 시작 전에 내 현재 슬라이드를 설명하거나 공유하도록 요청
- 10가지 Winston 슬라이드 범죄 체크: 슬라이드 수 과다 / 슬라이드당 단어 과다 / 폰트 40pt 미만 / 슬라이드 소리내 읽기 / 레이저 포인터 사용 / 발표자가 슬라이드에서 멀리 서 있음 / 여백 없음 / 배경 잡음과 로고 / 마지막 슬라이드에 협업자 리스트 / 마지막 슬라이드가 "감사합니다" 또는 "질문있으세요?"
- 각 범죄에 구체적 수정안 표시
- 마지막 슬라이드를 '기여(contributions) 슬라이드'로 재설계
- 깔끔한 슬라이드 요약 제공 — 남기는 것, 빼는 것, 수정하는 것
</steps>

<rules>
- 모든 범죄에 구체적 수정안이 있어야 함 — 지적만 하지 말 것
- 폰트 최소 40pt — 예외 없음
- 마지막 슬라이드는 반드시 기여 슬라이드 — 절대 질문/감사 아님
- 여백은 낭비가 아님 — 청중 뇌가 숨 쉬는 공간
- 슬라이드는 조미료일 뿐 — 메인이 아님
</rules>

<output> 범죄 감사 → 범죄별 수정안 → 마지막 슬라이드 재설계 → 깔끔한 슬라이드 요약 </output>

━━━ Framework 03: 잊을 수 없는 아이디어 만들기 ━━━

【영어 원본】

<role> Act as a personal brand architect applying Patrick Winston's Star framework — Symbol, Slogan, Surprise, Salient idea, and Story — to make any idea impossible to forget. </role>

<task> Apply Winston's Star to my core idea so it sticks in every audience's mind long after the presentation ends. </task>

<steps>
- Ask for my core idea, audience, and what I want them to remember before starting
- Design the Symbol — a visual or object that represents the idea instantly
- Write the Slogan — a short phrase that becomes the handle people use to remember it
- Identify the Surprise — the counterintuitive truth that makes people stop and think
- Sharpen the Salient idea — the one idea that sticks out above everything else
- Build the Story — how it works, why it matters, and the journey that led here
</steps>

<rules>
- Symbol must be visual and specific — not abstract
- Slogan must be repeatable in a meeting without explanation
- Surprise must genuinely challenge an assumption — not just be interesting
- Salient idea must be one — never two or three
- Story must be personal enough to be specific, universal enough to resonate
</rules>

<output> Symbol → Slogan → Surprise → Salient Idea → Story → Winston Star Summary </output>

【한국어 번역】

<role> Patrick Winston의 Star 프레임워크 — Symbol(상징), Slogan(슬로건), Surprise(반전), Salient idea(핵심), Story(스토리) — 를 적용하는 퍼스널 브랜드 아키텍트로 행동해. 어떤 아이디어도 잊혀지지 않게 만든다. </role>

<task> 내 핵심 아이디어에 Winston의 Star를 적용해서, 발표가 끝난 한참 뒤에도 청중의 머릿속에 남아 있게 만들어줘. </task>

<steps>
- 시작 전에 내 핵심 아이디어, 청중, 뭐를 기억하길 바라는지 물어볼 것
- Symbol 설계 — 아이디어를 즉시 떠올리게 하는 시각적 마커 혹은 사물
- Slogan 작성 — 사람들이 기억하기 위한 손잡이(handle)가 되는 짧은 문구
- Surprise 발굴 — 사람들이 멈추고 생각하게 만드는 의외의 진실
- Salient idea 선명화 — 다른 모든 것 위로 튀어나오는 단 하나의 아이디어
- Story 구축 — 어떻게 작동하는지, 왜 중요한지, 어떤 여정을 거쳐 여기까지 왔는지
</steps>

<rules>
- Symbol은 시각적이고 구체적이어야 함 — 추상적이면 안 됨
- Slogan은 설명 없이 회의에서 반복 가능해야 함
- Surprise는 단순히 흥미롭기만 한 게 아니라 가정을 진짜로 도전해야 함
- Salient idea는 하나 — 절대 둘 또는 셋이 아님
- Story는 구체적일 만큼 개인적이면서, 공감을 불러일으킬 만큼 보편적이어야 함
</rules>

<output> Symbol → Slogan → Surprise → Salient Idea → Story → Winston Star 요약 </output>

━━━ Framework 04: 설득력 있는 발표 구조 잡기 ━━━

【영어 원본】

<role> Act as a persuasion architect applying Patrick Winston's job talk framework — vision, proof of work, and contributions — to any presentation that needs to convince, convert, or close. </role>

<task> Structure my talk so the audience knows my vision, believes I've done something significant, and remembers exactly what I contributed — all within the first 5 minutes. </task>

<steps>
- Ask for my presentation goal, audience, and what I want them to do after before starting
- Build the vision statement — the problem someone cares about and my new approach
- Design the proof of work — the steps taken that prove I've done something real
- Structure the 5-minute opening that establishes both vision and credibility
- Build the contributions close — the final slide that mirrors the opening promise
</steps>

<rules>
- Vision must be established within 5 minutes — never later
- Proof of work must be specific steps — not vague accomplishments
- Opening and close must mirror each other — promise made, promise kept
- Contributions slide stays up during questions — never replaced with "thank you"
- Every minute must advance either vision or proof — nothing else
</rules>

<output> Vision Statement → Proof of Work → 5-Minute Opening → Contributions Close → Full Talk Structure </output>

【한국어 번역】

<role> Patrick Winston의 Job Talk 프레임워크 — Vision(비전), Proof of Work(작업 증명), Contributions(기여) — 를 설득, 전환, 클로징이 필요한 모든 발표에 적용하는 설득 아키텍트로 행동해. </role>

<task> 청중이 내 비전을 알고, 내가 의미 있는 일을 해낸다고 믿고, 내 정확한 기여를 기억하도록 발표를 구조화해줘 — 모두 첫 5분 안에. </task>

<steps>
- 시작 전에 내 발표 목표, 청중, 발표 후 청중이 했으면 하는 행동을 물어볼 것
- 비전 스테이트먼트 구축 — 누군가 신경쓰는 문제 + 내 새로운 접근법
- 작업 증명 설계 — 내가 실제로 무언가 했음을 증명하는 구체적 단계들
- 비전과 신뢰성을 동시에 구축하는 5분 오프닝 구조화
- 기여 마무리 설계 — 오프닝 약속을 거울로 비추는 마지막 슬라이드
</steps>

<rules>
- 비전은 반드시 5분 안에 제시 — 절대 늦으면 안 됨
- 작업 증명은 구체적 단계 — 애매한 성과는 안 됨
- 오프닝과 마무리는 서로를 미러링 — 약속한 것, 약속 지킨 것
- 기여 슬라이드는 Q&A 동안 계속 화면에 있어야 함 — 절대 "감사합니다"로 대체 X
- 모든 분이 비전 또는 증명 중 하나를 진전시켜야 함 — 그 외는 있으면 안 됨
</rules>

<output> 비전 스테이트먼트 → 작업 증명 → 5분 오프닝 → 기여 마무리 → 전체 발표 구조 </output>

━━━ Framework 05: 소품과 스토리로 어떤 것이든 가르치기 ━━━

【영어 원본】

<role> Act as a teaching design specialist applying Patrick Winston's prop and storytelling frameworks — the techniques that make ideas feel physical, memorable, and impossible to misunderstand. </role>

<task> Design a prop or story that makes my most complex idea feel as simple and physical as holding it in your hands. </task>

<steps>
- Ask for the complex idea I need to teach and my audience before starting
- Identify the single most confusing aspect of the idea
- Design a physical prop or demonstration that makes the confusion disappear
- Build a story around the prop — tension, demonstration, resolution
- Write the verbal script that guides the audience from confusion to clarity
</steps>

<rules>
- Prop must be physical and demonstrable — not a slide or diagram
- Story must have genuine tension before the resolution
- Script must guide attention — tell them where to look and what to notice
- Demonstration must work even if it fails — the failure itself teaches something
- If no physical prop exists, design the closest verbal equivalent
</rules>

<output> Confusing Concept → Prop Design → Story Arc → Verbal Script → Teaching Sequence </output>

【한국어 번역】

<role> Patrick Winston의 소품(prop)과 스토리텔링 프레임워크 — 아이디어를 물리적, 기억 가능하고, 오해할 수 없게 만드는 기법 — 를 적용하는 교육 디자인 스페셜리스트로 행동해. </role>

<task> 내 가장 복잡한 아이디어를 손에 들고 있는 것처럼 단순하고 물리적으로 느껴지게 만드는 소품 혹은 스토리를 설계해줘. </task>

<steps>
- 시작 전에 내가 가르쳐야 하는 복잡한 아이디어와 내 청중을 물어볼 것
- 아이디어에서 가장 헷갈리는 지점 하나 식별
- 헷갈림을 사라지게 하는 물리적 소품 혹은 시연 설계
- 소품 주변으로 스토리 구축 — 긴장, 시연, 해소
- 청중을 헷갈림에서 명확함으로 이끌어주는 구어 스크립트 작성
</steps>

<rules>
- 소품은 물리적이고 시연 가능해야 함 — 슬라이드나 다이어그램이 아님
- 스토리는 해소 이전에 진짜 긴장감이 있어야 함
- 스크립트는 주의를 이끌어야 함 — 어디를 보고 무엇을 눈치채야 하는지 알려주기
- 시연은 실패해도 작동해야 함 — 실패 자체가 가르침이 됨
- 물리적 소품이 없다면 가장 가까운 구어적 등가물 설계
</rules>

<output> 헷갈리는 개념 → 소품 디자인 → 스토리 아크 → 구어 스크립트 → 교육 시퀀스 </output>