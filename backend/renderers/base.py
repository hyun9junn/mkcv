from abc import ABC, abstractmethod
from backend.models import CVData


class BaseRenderer(ABC):
    @abstractmethod
    def render(self, cv: CVData) -> str: ...
