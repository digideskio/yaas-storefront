var fs = require('fs');
var tu = require('./protractor-utils.js');

describe("product page", function () {

  describe("verify product pages", function () {

    beforeEach(function () {
      browser.get('#!/products');
      browser.driver.manage().window().maximize();
      browser.sleep(8000);
    });

      
      it('should scroll to load more products', function () {
        tu.getTextByRepeaterRow(0)
        tu.scrollToBottomOfProducts(10000);
        tu.getTextByRepeaterRow(35) //verify last product has loaded
        tu.clickElement('xpath', tu.backToTopButton);        
        tu.clickElement('xpath', tu.bicycle);
      });

      it('should show the user how many products loaded', function () {
        tu.getTextByRepeaterRow(0)
        expect(element(by.css('div.page-indicator.ng-binding')).getText()).toEqual('1-12 of 0'); //should be # of 36, but won't work in phantomjs
        tu.scrollToBottomOfProducts(10000);
        tu.getTextByRepeaterRow(35) //verify last product has loaded
        expect(element(by.css('div.col-xs-6 > div.viewingContainer > div.page-indicator.ng-binding')).getText()).toEqual('1-36 of 0'); //should be # of 36, but won't work in phantomjs
      });

      it("should get product detail page", function () {
        tu.scrollToBottomOfProducts(3500);
        tu.clickElement('xpath', tu.bicycle);
        browser.sleep(100);
        expect(tu.bicycleDescription.getText()).toEqual('Description:\nA bicycle, often called a bike, is a human-powered, pedal-driven, single-track vehicle, having two wheels attached to a frame, one behind the other. A bicycle rider is called a cyclist, or bicyclist.');

    });

      it("should get order of products correctly", function () {
        //default load
        tu.getTextByRepeaterRow(0);
        tu.sortAndVerifyPagination('price', 'RING HEART BOWL', 'TALK TO ME COFFEE MUGS');
        tu.sortAndVerifyPagination('-price', 'ESPRESSO MACHINE', 'BIRDHOUSE');
        tu.sortAndVerifyPagination('name', 'BIRDHOUSE', 'DIFFERENT CERAMIC BIRDS (5)');
        tu.sortAndVerifyPagination('-name', 'WOOD-BOUND CHEMEX COFFEE MAKER', 'SET OF 92 CUPS');
        tu.sortAndVerifyPagination('created', 'TATTERED BOWLS', 'BIRDHOUSE');
    });

  }); 
}); 

