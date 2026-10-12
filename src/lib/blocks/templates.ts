/** Starter layouts for the editor's empty state. Built from real blocks (fresh ids on every call). */
import { createBlock } from './document';
import type { Block } from './types';

export interface BlockTemplate {
    id: string;
    label: string;
    description: string;
    create: () => Block[];
}

export const TEMPLATES: BlockTemplate[] = [
    {
        id: 'hero-intro',
        label: 'Hero intro',
        description: 'Centred headline, short text and a call to action.',
        create: () => {
            const section = createBlock('section', { background: 'alt', padding: 'lg', align: 'center' });
            section.children = [
                createBlock('heading', { text: 'A headline that says it all', level: 2 }),
                createBlock('paragraph', {
                    text: 'Add one or two sentences that explain what visitors will find here.',
                    size: 'lg',
                    tone: 'muted',
                }),
                createBlock('button', { label: 'Read more', href: '/posts', variant: 'primary', align: 'center' }),
            ];
            return [section];
        },
    },
    {
        id: 'two-column-cards',
        label: 'Two-column cards',
        description: 'A heading followed by two side-by-side cards.',
        create: () => {
            const row = createBlock('row', { direction: 'responsive', gap: 'md' });
            row.children = [
                createBlock('card', {
                    title: 'First highlight',
                    body: 'Describe the first thing you want visitors to notice.',
                }),
                createBlock('card', {
                    title: 'Second highlight',
                    body: 'Describe the second thing you want visitors to notice.',
                }),
            ];
            return [createBlock('heading', { text: 'What to expect', level: 2 }), row];
        },
    },
    {
        id: 'faq',
        label: 'FAQ',
        description: 'Frequently asked questions as an accordion.',
        create: () => [
            createBlock('heading', { text: 'Frequently asked questions', level: 2 }),
            createBlock('accordion', {
                items: [
                    { title: 'First question?', body: 'Write the answer here.' },
                    { title: 'Second question?', body: 'Write the answer here.' },
                    { title: 'Third question?', body: 'Write the answer here.' },
                ],
            }),
        ],
    },
    {
        id: 'announcement',
        label: 'Announcement',
        description: 'A notice with key figures and a paragraph.',
        create: () => [
            createBlock('callout', {
                tone: 'info',
                title: 'Important announcement',
                text: 'Summarise the most important point in one or two sentences.',
            }),
            createBlock('stats', {
                items: [
                    { value: '1', label: 'First figure', hint: '' },
                    { value: '2', label: 'Second figure', hint: '' },
                    { value: '3', label: 'Third figure', hint: '' },
                ],
            }),
            createBlock('paragraph', { text: 'Add the details here.' }),
        ],
    },
];
