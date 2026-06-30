"""등급 산정 — 다언어 폴백 예제(Python). 기능_등급산정.md 구현 골격."""


class GradeService:
    def __init__(self, repo):
        self.repo = repo

    def assess(self, member_id: str, approved_amount: int) -> str:
        total = self.repo.add(member_id, approved_amount)
        return self._tier(total)

    def _tier(self, total: int) -> str:
        if total >= 1000000:
            return "GOLD"
        if total >= 100000:
            return "SILVER"
        return "BRONZE"
