/**
 * @file Define here shared global state for the application.
 */

export interface Status {
	message: string;
	className: '' | 'invalid' | 'active' | 'prepared' | 'inactive';
}

export const header = $state({ status: { message: '', className: '' } as Status });

/**
 * Set a status message, which will be shown in a pill in the <Header showStatus={true} /> component.
 * Do *not* call this during server rendering (so it's OK to call in onMount or in response to user interaction, but not directly in the <script/> of a component).
 *
 * @param message A very short string (one word ideally)
 * @param className Applies one of the predefined styles to the status pill in the header.
 */
export const setStatus = (message: string, className: Status['className'] = '') => {
	header.status = { message, className };
};
