export interface BreadcrumbItem {
    title: string;
    href?: string;
}

/** Signed-in user as shown in the admin shell (subset of App.Locals['user']). */
export interface AdminUser {
    id: number;
    name: string;
    email: string;
    role: string;
}

export interface NavItem {
    title: string;
    href: string;
    icon?: import('svelte').Component<{ class?: string }>;
}
