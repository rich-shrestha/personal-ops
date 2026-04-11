# FreeTaxUSA Notes

Date: 2026-04-10

Purpose: ground the first tax workflow in FreeTaxUSA's actual filing flow before adding high-trust browser execution.

## Confirmed Product Facts

- Free federal filing is still free, while state filing is a paid add-on.
- FreeTaxUSA supports major tax situations including W-2 income, common 1099 income, investments, self-employment, rental property, dependents, and education credits.
- Marketplace health insurance requires Form 1095-A handling and can trigger Form 8962.
- E-file requires a prior-year AGI or prior-year e-file PIN as the electronic signature path.

## Workflow Implications

- Do not move into browser-entry execution until the user has gathered core forms.
- Treat prior-year AGI or PIN as an explicit blocker for e-file.
- Ask about Marketplace coverage early because 1095-A / Form 8962 can delay filing.
- Distinguish prep from submission. The current app should prepare and organize before any high-trust website automation.

## Official Sources

- Pricing: https://www.freetaxusa.com/pricing/
- Supported forms and tax situations: https://www.freetaxusa.com/student
- E-file requirements: https://www.freetaxusa.com/answer/2737/How-do-I-efile-my-tax-return/
- Prior-year AGI details: https://www.freetaxusa.com/answer/12115/Where-do-I-enter-my-prior-year-adjusted-gross-income-AGI/
- Prior-year e-file PIN details: https://www.freetaxusa.com/answer/12116/Where-do-I-enter-my-prior-year-efile-PIN/
- Marketplace Form 1095-A overview: https://www.freetaxusa.com/answer/5907/What-is-Form-1095A/
- Form 1095-A usage / Form 8962 note: https://www.freetaxusa.com/answer/6994/How-do-I-use-the-information-on-my-Form-1095A/
