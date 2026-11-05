/**
 * The models of a Prisma client, read from the client itself: used by code that must cover every table
 * without a hand-written list (storage cleanup's reference scan, `db:copy`). Free of `astro:*` imports.
 */

export interface ModelField {
    name: string;
    /** `scalar` (a column), `object` (a relation) or `enum`. */
    kind: string;
    /** Prisma type: `String`, `Int`, `DateTime`, …, or the related model's name. */
    type: string;
}

export interface PrismaModel {
    /** Model name, e.g. `CarouselItem`. */
    name: string;
    /** Client property, e.g. `carouselItem`. */
    delegate: string;
    fields: ModelField[];
}

/** The only parts of Prisma's internal runtime data model that are read. */
interface RuntimeDataModel {
    models: Record<string, { fields: ModelField[] }>;
}

function isRuntimeDataModel(value: unknown): value is RuntimeDataModel {
    return (
        typeof value === 'object' &&
        value !== null &&
        'models' in value &&
        typeof value.models === 'object' &&
        value.models !== null
    );
}

/**
 * Every model of `client`. Prisma 7 exposes no public DMMF on the client, so this reads its internal
 * `_runtimeDataModel`; it is the single place that touches that private field and throws when a Prisma
 * upgrade removes it (the storage-cleanup and copy tests catch that).
 */
export function prismaModels(client: object): PrismaModel[] {
    const model: unknown = Reflect.get(client, '_runtimeDataModel');
    if (!isRuntimeDataModel(model)) throw new Error('Prisma client has no readable runtime data model');
    return Object.entries(model.models).map(([name, { fields }]) => ({
        name,
        delegate: name.charAt(0).toLowerCase() + name.slice(1),
        fields,
    }));
}

/** The client property for `delegate`, when it is a model delegate with `findMany`. */
export function modelDelegate<D>(client: object, delegate: string): D | undefined {
    const value: unknown = Reflect.get(client, delegate);
    return typeof value === 'object' && value !== null && 'findMany' in value && typeof value.findMany === 'function'
        ? (value as D)
        : undefined;
}
