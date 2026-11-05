# San Isidro College website

The public website of San Isidro College and the admin used to publish it. The college-wide Main site and each Department's page are edited by the people responsible for them.

## Language

### Organisation

**Department**:
A college or academic division of San Isidro College that has its own public page and its own content.
_Avoid_: school, division, unit

**Main site**:
The college-wide content that belongs to no Department: the home page and everything shown there.
_Avoid_: landing page, global, root

**Department page**:
The public page of one Department, with its Slides, Hero sections, Posts and Org chart.
_Avoid_: department site, microsite

### People

**User**:
A person who signs in to the admin.
_Avoid_: account, admin, administrator

**Password login**:
The email-and-password way a User signs in, kept as one stored password hash. Changing or resetting it ends the User's other sessions.
_Avoid_: credentials, credential account, login

**Superadmin**:
A User who can work on the Main site and on every Department. There is always at least one: the last Superadmin cannot be deleted or changed to a Department user.
_Avoid_: admin, owner

**Department user**:
A User who can work only on the one Department they belong to.
_Avoid_: editor, department admin

**Member**:
A person shown in a Department's Org chart. A Member is not a User and cannot sign in.
_Avoid_: staff, employee, person

**Org chart**:
The reporting hierarchy of the Members of one Department.
_Avoid_: member tree, organisation tree, staff list

**Manager**:
The Member another Member reports to. A Member has at most one Manager, and that Manager is in the same Department.
_Avoid_: parent, supervisor

**Direct report**:
A Member whose Manager is a given Member.
_Avoid_: child, subordinate

### Content

**Post**:
A dated piece of news published on the Main site or for one Department, written by a User.
_Avoid_: news item, entry, story

**Post type**:
The kind of Post: Article, Event or Announcement.
_Avoid_: category

**Event**:
A Post about something that happens between a start date and an end date.
_Avoid_: activity, calendar entry

**Featured post**:
A Post that its editors have marked for extra prominence.
_Avoid_: pinned, highlighted

**Highlight image**:
The lead image of a Post.
_Avoid_: cover, thumbnail, banner

**Image variant**:
The smaller copy (640 px WebP) of a Highlight image, stored next to the original and used by Post cards.
_Avoid_: thumbnail, resized image

**Rich content**:
Formatted body text for a Post, a Hero section or the Welcome hero. It is either a Block document or Legacy Markdown.
_Avoid_: body, HTML, markup

**Block document**:
Rich content made of an ordered list of Blocks.
_Avoid_: JSON content, page builder content

**Block**:
One typed piece of a Block document, such as a heading, a paragraph or an image.
_Avoid_: element, widget, section

**Block type**:
The kind of a Block (heading, image, album, video…). Everything about one Block type is defined in one place.
_Avoid_: widget type, element kind

**Editing session**:
One editor's working state on a Block document: its Blocks, undo history, selection and the content to save.
_Avoid_: editor state, draft

**Legacy Markdown**:
Rich content written in Markdown before Block documents existed.
_Avoid_: old content, plain content

**Excerpt**:
A short plain-text summary of a Post, taken from its stored plain text (the `searchText` kept in step with its Rich content), never from parsing the content.
_Avoid_: preview, snippet, teaser

**Welcome hero**:
The introductory Rich content at the top of the Main site's home page.
_Avoid_: landing settings, welcome text

**Department hero**:
The introductory content at the top of a Department page.
_Avoid_: department intro, hero content

**Hero section**:
An ordered panel of Rich content shown on the Main site or on one Department page. Each Hero section can be switched off without being deleted.
_Avoid_: banner, block, section

**Carousel**:
The rotating sequence of Slides at the top of the Main site or of a Department page.
_Avoid_: slider, gallery

**Slide**:
One picture in a Carousel, optionally with an Overlay and a Background video. A Slide belongs to the Main site or to one Department, and it can also be shown on the Main site.
_Avoid_: carousel item, banner

**Overlay**:
The designed text, buttons and images placed on top of a Slide's picture.
_Avoid_: caption, design

**Layer**:
One positioned piece of an Overlay, such as a heading, a button or an image.
_Avoid_: element, object

**Mobile layout**:
How a Slide looks on a phone: a taller 4:5 frame in which each Layer is stacked automatically, or placed, resized or hidden by hand. The designer edits it with its Desktop/Mobile switch.
_Avoid_: responsive version, small-screen mode

**Legacy Slide**:
A Slide saved before the designer existed: it has only a title, subtitle and link, no Overlay. It is shown as Layers converted from those fields; saving it in the designer stores them as an Overlay.
_Avoid_: old slide, classic slide

**Background video**:
A muted, looping video, either uploaded or from YouTube, that plays behind the Layers of a Slide. The Slide's picture stays as its poster while the video loads and for visitors who prefer reduced motion or save data.
_Avoid_: hero video, movie

**Navigation link**:
An entry in the site header menu. It may hold one level of nested Navigation links.
_Avoid_: menu item, nav item

**Default menu**:
The header menu of Home, Departments, News & Events, Downloads and Contact. Visitors see it while no Navigation links are stored, and a Superadmin can create it as Navigation links.
_Avoid_: fallback menu, standard nav

### Downloads

**Download**:
A public file offered on the site, such as a form, a handbook or a report, uploaded by a User.
_Avoid_: attachment, document, upload

**Directory**:
A named group of Downloads that belongs to the Main site or to one Department. A Download stored without one is in the Directory General.
_Avoid_: folder, category

**Tag**:
A free-text label on a Download that helps visitors find it.
_Avoid_: keyword, label

**File kind**:
The broad family of a Download file: PDF, document, spreadsheet, image, archive or other.
_Avoid_: file type, format, MIME type

**Pending upload**:
A file (a Download file or a video) that a User uploaded straight to storage under a server-issued key and has not yet attached to a record. It is claimed once, by that User, within an hour; the key then belongs to whatever content stores it. An expired Pending upload only loses its record: the file stays until the storage cleanup finds nothing referencing it.
_Avoid_: draft upload, temp file

### Admin

**Admin scope**:
The slice of content a User is working on in the admin: All, Main, or one Department. A Department user's Admin scope is always their own Department.
_Avoid_: filter, context, workspace

**Main scope**:
The Admin scope that covers only Main site content. A Slide that is merely also shown on the Main site, but belongs to a Department, is outside Main scope.
_Avoid_: global scope, no department
