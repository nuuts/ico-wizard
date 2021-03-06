import { observable, action } from 'mobx';

class StepTwoValidationStore {

  @observable name;
	@observable ticker;
	@observable decimals;

	constructor() {
		this.name = 'EMPTY'
		this.ticker = 'EMPTY'
		this.decimals = 'EMPTY'
	}

	@action property = (property, value) => {
		this[property] = value
	}

}

const stepTwoValidationStore = new StepTwoValidationStore();

export default stepTwoValidationStore;
export { StepTwoValidationStore };
