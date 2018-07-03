import React, { Component } from "react";
import autoBind from "react-autobind";
import moment from "moment";

class App extends Component {
	constructor(props) {
		super(props);
		autoBind(this);

		this.state = {
			apiKey: "",
			boardID: "",
			person: "",
			boardData: [],
			timers: {}
		};
	}

	componentDidMount() {
		const searchParams = new URLSearchParams(window.location.search);
		if (searchParams) {
			this.setState(
				{
					apiKey: searchParams.get("apiKey") ? searchParams.get("apiKey") : "",
					person: searchParams.get("person") ? searchParams.get("person") : "",
					boardID: searchParams.get("boardID")
						? searchParams.get("boardID")
						: ""
				},
				() => {
					if (this.state.boardID && this.state.apiKey) {
						this.retrieveBoard();
					}
				}
			);
		}
	}

	componentWillUnmount() {
		for (const timer of Object.keys(this.state.timers)) {
			const pulse = this.state.boardData.find(toSearch => {
				return toSearch.pulse.id.toString() === timer;
			});

			this.stop(pulse);
		}
	}

	async retrieveBoard() {
		this.setState({ boardData: [] });
		let allDataRetrieved = false;
		let pageOffset = 1;
		while (!allDataRetrieved && pageOffset < 25) {
			const response = await fetch(
				`https://api.monday.com/v1/boards/${
					this.state.boardID
				}/pulses.json?per_page=25&page=${pageOffset}&api_key=${
					this.state.apiKey
				}`
			);
			const parsedJSON = await response.json();
			this.setState({ boardData: [...this.state.boardData, ...parsedJSON] });

			if (parsedJSON.length === 0) {
				allDataRetrieved = true;
			}
			pageOffset++;
		}

		if (this.state.person) {
			this.setState({
				boardData: this.state.boardData.filter(pulse => {
					return (
						pulse.column_values[1].value &&
						pulse.column_values[1].value.name === this.state.person
					);
				})
			});
		}
	}

	formatData(data) {
		let formBody = [];
		for (const property in data) {
			const encodedKey = encodeURIComponent(property);
			const encodedValue = encodeURIComponent(data[property]);
			formBody.push(encodedKey + "=" + encodedValue);
		}
		return formBody.join("&");
	}

	start(pulse) {
		const pulseID = pulse.pulse.id;
		fetch(
			`https://api.monday.com:443/v1/boards/${
				this.state.boardID
			}/columns/status/status.json?api_key=${this.state.apiKey}`,
			{
				headers: {
					Accept: "application/json",
					"Content-Type": "application/x-www-form-urlencoded"
				},
				body: this.formatData({
					board_id: this.state.boardID,
					column_id: "status",
					pulse_id: pulseID,
					color_index: 4
				}),
				method: "PUT"
			}
		);

		let timers = this.state.timers;
		timers[pulseID] = new Date();
		this.setState({ timers }, () => {
			const interval = setInterval(() => {
				if (!Object.keys(this.state.timers).includes(pulseID.toString())) {
					clearInterval(interval);
				}
				const timeWorkedAsHours = moment
					.duration(new Date() - this.state.timers[pulseID])
					.asHours();

				const currentHours = isNaN(parseFloat(pulse.column_values[5].value))
					? 0
					: parseFloat(pulse.column_values[5].value);

				this.setState({
					[`running${pulseID}`]:
						Math.round((timeWorkedAsHours + currentHours) * 1000) / 1000
				});
			}, 3000);

			const intervalAutoupdateMonday = setInterval(() => {
				if (!Object.keys(this.state.timers).includes(pulseID.toString())) {
					clearInterval(intervalAutoupdateMonday);
				}

				const timeWorkedAsHours = moment
					.duration(new Date() - this.state.timers[pulseID])
					.asHours();

				const currentHours = isNaN(parseFloat(pulse.column_values[5].value))
					? 0
					: parseFloat(pulse.column_values[5].value);

				fetch(
					`https://api.monday.com:443/v1/boards/${
						this.state.boardID
					}/columns/numbers7/numeric.json?api_key=${this.state.apiKey}`,
					{
						headers: {
							Accept: "application/json",
							"Content-Type": "application/x-www-form-urlencoded"
						},
						body: this.formatData({
							board_id: this.state.boardID,
							column_id: "numbers7",
							pulse_id: pulseID,
							value: currentHours + timeWorkedAsHours
						}),
						method: "PUT"
					}
				);
			}, 60 * 1000 * 3);
		});
	}

	stop(pulse) {
		const pulseID = pulse.pulse.id;

		fetch(
			`https://api.monday.com:443/v1/boards/${
				this.state.boardID
			}/columns/status/status.json?api_key=${this.state.apiKey}`,
			{
				headers: {
					Accept: "application/json",
					"Content-Type": "application/x-www-form-urlencoded"
				},
				body: this.formatData({
					board_id: this.state.boardID,
					column_id: "status",
					pulse_id: pulseID,
					color_index: 9
				}),
				method: "PUT"
			}
		);

		const timeWorkedAsHours = moment
			.duration(new Date() - this.state.timers[pulseID])
			.asHours();
		let timers = this.state.timers;
		delete timers[pulseID];
		this.setState({
			timers,
			[`running${pulseID}`]: undefined
		});

		const currentHours = isNaN(parseFloat(pulse.column_values[5].value))
			? 0
			: parseFloat(pulse.column_values[5].value);

		fetch(
			`https://api.monday.com:443/v1/boards/${
				this.state.boardID
			}/columns/numbers7/numeric.json?api_key=${this.state.apiKey}`,
			{
				headers: {
					Accept: "application/json",
					"Content-Type": "application/x-www-form-urlencoded"
				},
				body: this.formatData({
					board_id: this.state.boardID,
					column_id: "numbers7",
					pulse_id: pulseID,
					value: currentHours + timeWorkedAsHours
				}),
				method: "PUT"
			}
		);

		let boardData = [...this.state.boardData];

		const pulseIndexToUpdate = boardData.findIndex(pulse => {
			return pulse.pulse.id === pulseID;
		});

		boardData[pulseIndexToUpdate].column_values[5].value =
			Math.round((currentHours + timeWorkedAsHours) * 1000) / 1000;

		this.setState({ boardData });
	}

	done(pulse) {
		const pulseID = pulse.pulse.id;

		fetch(
			`https://api.monday.com:443/v1/boards/${
				this.state.boardID
			}/columns/status/status.json?api_key=${this.state.apiKey}`,
			{
				headers: {
					Accept: "application/json",
					"Content-Type": "application/x-www-form-urlencoded"
				},
				body: this.formatData({
					board_id: this.state.boardID,
					column_id: "status",
					pulse_id: pulseID,
					color_index: 1
				}),
				method: "PUT"
			}
		);

		if (Object.keys(this.state.timers).includes(pulse.pulse.id.toString())) {
			const timeWorkedAsHours = moment
				.duration(new Date() - this.state.timers[pulseID])
				.asHours();
			let timers = this.state.timers;
			delete timers[pulseID];
			this.setState({ timers });

			const currentHours = isNaN(parseFloat(pulse.column_values[5].value))
				? 0
				: parseFloat(pulse.column_values[5].value);

			fetch(
				`https://api.monday.com:443/v1/boards/${
					this.state.boardID
				}/columns/numbers7/numeric.json?api_key=${this.state.apiKey}`,
				{
					headers: {
						Accept: "application/json",
						"Content-Type": "application/x-www-form-urlencoded"
					},
					body: this.formatData({
						board_id: this.state.boardID,
						column_id: "numbers7",
						pulse_id: pulseID,
						value: currentHours + timeWorkedAsHours
					}),
					method: "PUT"
				}
			);
		}
	}

	async openBoard() {
		const response = await fetch(
			`https://api.monday.com:443/v1/boards/${
				this.state.boardID
			}.json?api_key=${this.state.apiKey}`,
			{
				headers: {
					Accept: "application/json",
					"Content-Type": "application/x-www-form-urlencoded"
				},
				method: "GET"
			}
		);

		const parsedJSON = await response.json();

		window.open(parsedJSON.url);
	}

	render() {
		return (
			<div className="container">
				<div className="row" style={{ marginTop: 30 }}>
					<div className="col-sm">
						<div className="input-group">
							<div className="input-group-prepend">
								<span className="input-group-text">BoardID:</span>
							</div>
							<input
								className="form-control"
								type="text"
								value={this.state.boardID}
								onChange={evt => {
									this.setState({ boardID: evt.target.value });
								}}
							/>
						</div>
					</div>
					<div className="col-sm">
						<div className="input-group">
							<div className="input-group-prepend">
								<span className="input-group-text">API Key:</span>
							</div>
							<input
								className="form-control"
								type="text"
								value={this.state.apiKey}
								onChange={evt => {
									this.setState({ apiKey: evt.target.value });
								}}
							/>
						</div>
					</div>
					<div className="col-sm">
						<div className="input-group">
							<div className="input-group-prepend">
								<span className="input-group-text">Person:</span>
							</div>
							<input
								className="form-control"
								type="text"
								value={this.state.person}
								onChange={evt => {
									this.setState({ person: evt.target.value });
								}}
							/>
						</div>
					</div>
				</div>
				<div className="row" style={{ marginTop: 30 }}>
					<div className="col-sm text-center">
						<button onClick={this.retrieveBoard} className="btn btn-primary">
							Retrieve Board
						</button>
						<button
							onClick={this.openBoard}
							className="btn btn-primary"
							style={{ marginLeft: 20 }}
						>
							Open Board
						</button>
					</div>
				</div>
				<hr />
				{this.state.boardData.length ? (
					<table className="table table-bordered table-striped">
						<thead>
							<tr>
								<th className="text-right">Name</th>
								<th className="text-center">Est Hours</th>
								<th className="text-center">Cur Hours</th>
								<th className="text-center">Start</th>
								<th className="text-center">Stop</th>
								<th className="text-center">Done</th>
							</tr>
						</thead>
						<tbody>
							{this.state.boardData.map(pulse => {
								const timerRunning = !Object.keys(this.state.timers).includes(
									pulse.pulse.id.toString()
								);
								const pulseDone =
									pulse.column_values[3].value &&
									pulse.column_values[3].value.index === 1;
								return (
									<tr
										key={pulse.pulse.id}
										className={`${pulseDone ? "table-success" : ""} ${
											timerRunning ? "" : "table-warning"
										}`}
									>
										<td
											className="text-right"
											style={{ verticalAlign: "middle" }}
										>
											{pulse.pulse.name}
										</td>
										<td
											className="text-center"
											style={{ verticalAlign: "middle" }}
										>
											{pulse.column_values[4].value}
										</td>
										<td
											className="text-center"
											style={{ verticalAlign: "middle" }}
										>
											{this.state[`running${pulse.pulse.id}`]
												? this.state[`running${pulse.pulse.id}`]
												: Math.round(pulse.column_values[5].value * 1000) /
												  1000}
										</td>
										<td className="text-center">
											<button
												className="btn btn-warning"
												onClick={this.start.bind(this, pulse)}
												disabled={!timerRunning}
											>
												Start
											</button>
										</td>
										<td className="text-center">
											<button
												className="btn btn-danger"
												onClick={this.stop.bind(this, pulse)}
												disabled={timerRunning}
											>
												Stop
											</button>
										</td>
										<td className="text-center">
											<button
												className="btn btn-success"
												onClick={this.done.bind(this, pulse)}
												disabled={pulseDone}
											>
												Done
											</button>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				) : null}
			</div>
		);
	}
}

export default App;
