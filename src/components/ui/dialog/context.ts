export type DialogContext = {
    open: () => boolean;
    setOpen: (value: boolean) => void;
    /** Id of the title element; `DialogContent` points `aria-labelledby` at it. */
    titleId: string;
    /** Id of the description element; `DialogContent` points `aria-describedby` at it while one is rendered. */
    descriptionId: string;
    /** True while a `DialogDescription` is mounted. */
    hasDescription: () => boolean;
    /** Called by `DialogDescription` on mount; returns the function that unregisters it. */
    registerDescription: () => () => void;
};

export const DIALOG_CONTEXT = Symbol('dialog');
