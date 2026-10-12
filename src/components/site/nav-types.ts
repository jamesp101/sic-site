export interface NavItem {
    label: string;
    href?: string;
    children?: { label: string; href: string }[];
}
