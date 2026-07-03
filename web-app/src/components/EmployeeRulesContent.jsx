import { EMPLOYEE_RULES } from '../utils/employeeRules';

export function EmployeeRulesContent({ className = '' }) {
  return (
    <article className={`employee-rules-content ${className}`.trim()}>
      <h2 className="employee-rules-content__title">{EMPLOYEE_RULES.title}</h2>

      {EMPLOYEE_RULES.sections.map((section) => (
        <section key={section.heading} className="employee-rules-content__section">
          <h3 className="employee-rules-content__heading">{section.heading}</h3>
          <ul className="employee-rules-content__list">
            {section.items.map((item) => (
              <li key={item.slice(0, 24)}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
