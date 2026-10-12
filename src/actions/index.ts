// One module per resource. Each module exports a plain object of defineAction()s.
import { account } from './account';
import { carousels } from './carousels';
import { contact } from './contact';
import { departments } from './departments';
import { directories } from './directories';
import { downloads } from './downloads';
import { heroSections } from './heroSections';
import { members } from './members';
import { navlinks } from './navlinks';
import { posts } from './posts';
import { settings } from './settings';
import { users } from './users';

export const server = {
    account,
    carousels,
    contact,
    departments,
    directories,
    downloads,
    heroSections,
    members,
    navlinks,
    posts,
    settings,
    users,
};
