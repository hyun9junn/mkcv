from backend.models import CVData
from backend.renderers.base import BaseRenderer


class MarkdownRenderer(BaseRenderer):
    def render(self, cv: CVData) -> str:
        parts = []

        parts.append(f"# {cv.personal.name}\n")
        contact = [x for x in [cv.personal.email, cv.personal.phone, cv.personal.location] if x]
        if contact:
            parts.append(" · ".join(contact) + "  ")
        links = []
        if cv.personal.linkedin:
            links.append(f"[{cv.personal.linkedin}](https://{cv.personal.linkedin})")
        if cv.personal.github:
            links.append(f"[{cv.personal.github}](https://{cv.personal.github})")
        if cv.personal.website:
            links.append(f"[{cv.personal.website}](https://{cv.personal.website})")
        if links:
            parts.append(" · ".join(links))
        parts.append("")

        if cv.summary:
            parts.append("## Summary\n")
            parts.append(cv.summary.strip())
            parts.append("")

        if cv.experience:
            parts.append("## Work Experience\n")
            for job in cv.experience:
                end = job.end_date or "Present"
                parts.append(f"### {job.title} — {job.company}")
                parts.append(f"*{job.start_date} – {end}*\n")
                for h in job.highlights:
                    parts.append(f"- {h}")
                parts.append("")

        if cv.education:
            parts.append("## Education\n")
            for edu in cv.education:
                gpa = f" · GPA: {edu.gpa}" if edu.gpa else ""
                parts.append(f"### {edu.degree} — {edu.institution}")
                parts.append(f"*{edu.year}*{gpa}\n")

        if cv.skills:
            parts.append("## Skills\n")
            for group in cv.skills:
                parts.append(f"**{group.category}:** {', '.join(group.items)}  ")
            parts.append("")

        if cv.projects:
            parts.append("## Projects\n")
            for proj in cv.projects:
                name_part = f"[{proj.name}](https://{proj.url})" if proj.url else proj.name
                parts.append(f"### {name_part}")
                parts.append(proj.description)
                for h in proj.highlights:
                    parts.append(f"- {h}")
                parts.append("")

        if cv.certifications:
            parts.append("## Certifications\n")
            for cert in cv.certifications:
                issuer = f" — {cert.issuer}" if cert.issuer else ""
                date = f" · {cert.date}" if cert.date else ""
                parts.append(f"**{cert.name}**{issuer}{date}  ")
            parts.append("")

        if cv.publications:
            parts.append("## Publications\n")
            for pub in cv.publications:
                title = f"[{pub.title}](https://{pub.url})" if pub.url else f"**{pub.title}**"
                venue = f" — {pub.venue}" if pub.venue else ""
                date = f" · {pub.date}" if pub.date else ""
                parts.append(f"{title}{venue}{date}  ")
            parts.append("")

        if cv.languages:
            parts.append("## Languages\n")
            parts.append(" · ".join(f"**{l.language}:** {l.proficiency}" for l in cv.languages))
            parts.append("")

        return "\n".join(parts)
