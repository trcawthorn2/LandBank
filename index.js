const axios = require('axios');
const xlsx = require("node-xlsx");
const cachedInventory = require('./assets/cachedInventory.json');
const config = require('./assets/config.json')
const fs = require('fs');
const sendmail = require('sendmail')();

const bypassNetwork = false;
const cahceListings = true;
const sendEmail = true;
const runIntravelInSeconds = 0;//3600;


async function getListings(){
    console.log('Checking for new Listings: ', new Date(Date.now()));
    const url = 'https://build.renewlandbank.org/epp/inventory.xlsx';
    
    if(bypassNetwork){
        parseFile('./assets/inventory.xlsx');
    }else{      
        axios.get(url,  {responseType: "arraybuffer"}).then(resp => {
            parseFile(resp.data);
        });
    }

}

async function parseFile(data){
    const worksheet = xlsx.parse(data);
    let availableSheet = worksheet.find((element)=>{
        if(element.name == 'Available Landbank Inventory'){
            return element;
        }
    });
    const sheetsHeaders = availableSheet.data[0];
    let listings = [];
    for(var i=1; i < availableSheet.data.length; i++){
        let listing = createListing(sheetsHeaders, availableSheet.data[i]);
        listings.push(listing);
    }

    const newInventoryItems = getNewInventoryItems(listings);
    await notifyOfNewINventoryItems(newInventoryItems);
    updateCache(newInventoryItems);


}

function createListing(headers, data){
    let listing = {};
    for(var i=0; i<headers.length; i++){
        listing[headers[i]] = data[i];
    }
    return listing;
}

function getNewInventoryItems(listings){
    let newItems = [];
    listings.forEach(listing => {

        let cahcedFound = cachedInventory.find((element)=>{
            if(element.Parcel == listing.Parcel){
                return element;
            }
        });
        if(!cahcedFound){
            newItems.push(listing);
        }
    });
    return newItems;
}

async function notifyOfNewINventoryItems(items){
    for(var i = 0; i< items.length; i++){
        let zillowLink = await getZillowLink(items[i]);
        items[i].zillowLink = zillowLink;
    }
    if(items.length> 0){
        sendnotification(items);
    }

}

function sendnotification(items){
    let html = generateEmailHTML(items);
    if(sendEmail){
        sendmail({
            from: config.email.from,
            to: config.email.to.join(','),
            subject: 'Land Bank New Listing Alert',
            html: html,
        }, function(err, reply) {
            console.log(err && err.stack);
        });
    }else{
        console.log(html);
    }

}

function generateEmailHTML(items){
    let html = "<html><body><H1>Renew Landbank (New Items)</H1><table><tr><th style='min-width: 50px'>Type</th><th style='min-width: 50px'>Price</th><th style='min-width: 200px'>Location</th><th style='min-width: 50px' >Area</th><th style='min-width: 200px' >Zillow</th></tr>";
    items.forEach(item =>{
        html += `<tr><td>${item["Property Class"]}</td><td>${item["Price"]}</td><td>${item["Street Address"]}</td><td>${item["Neighborhood"]}</td><td><a href="${item["zillowLink"]}">${item["zillowLink"]}</a></td></tr>`;
    });
    html += "</table></body></html>";
    return html;
}

function updateCache(newInventoryItems){
    if(cahceListings){
        let newArray = cachedInventory.concat(newInventoryItems);
        fs.writeFile('./assets/cachedInventory.json', JSON.stringify(newArray), (error)=>{
            
        }); 
    }  
}

async function getZillowLink(item){
    let url = "https://www.zillowstatic.com/autocomplete/v3/suggestions?q=" + encodeURIComponent(`${item["Street Address"]} ${item["ZIP Code"]}`);
    
    let request = axios.get(url).then(resp => {
        console.log(JSON.stringify(resp.data));
        if(resp.data.results.length > 0) {
            
            return `https://www.zillow.com/homes/${resp.data.results[0].metaData.zpid}_zpid/`;
        }else {
            return ""
        };
    });
    return request;
}


console.log("Start: ", new Date(Date.now()));

if(runIntravelInSeconds == 0){ 
    getListings();
}else{
    setInterval(getListings, runIntravelInSeconds*1000 );
}

console.log("End");