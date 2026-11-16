/**
 * One glossary row (the shape `schema.json` describes).
 */
export type GlossaryTerm = {
    id: string;
    term: string;
    variants: string[];
    definition: string;
    learnMore: string;
    category: string;
    avoid?: string[];
    except?: string[];
    excludePages?: string[];
};
/**
 * a found form: the term it belongs to, the source text and its offsets in the searched string
 */
export type GlossaryHit = {
    id: string;
    text: string;
    start: number;
    end: number;
};
